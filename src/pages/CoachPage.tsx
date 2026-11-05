import { Activity, ArrowDown, ArrowUp, Calendar, History, Plus, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ChatMarkdown from '@/components/ChatMarkdown';
import CoachWaiting from '@/components/CoachWaiting';
import PlanCardPlaceholder from '@/components/PlanCardPlaceholder';
import SuggestionCard from '@/components/SuggestionCard';
import { Badge, Button, Card, Eyebrow, StatTile } from '@/components/ui';
import {
  acceptPlanSuggestion,
  ApiError,
  createChatSession,
  getChatHistory,
  getChatSessions,
  getChatTurn,
  getDashboard,
  streamChat,
  type ChatHistoryMessage,
  type PlanSuggestion,
} from '@/lib/api';
import {
  FOLLOWING_LABEL,
  isStreamStalled,
  newClientMessageId,
  runningTurnInHistory,
  TURN_FOLLOW_LIMIT_MS,
  TURN_POLL_MS,
} from '@/lib/chatTurn';
import { markReplaced, suggestionChips } from '@/lib/planSuggestion';
import { buildWeekPlan } from '@/lib/workout';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore, type ChatMessage } from '@/store/useAppStore';

const QUICK_REPLIES = ['Let’s do it.', 'Still too much today.', 'What should I focus on?'];

/** The coach's mark next to its messages (the Forma "F"). */
function CoachAvatar({ size = 28 }: { size?: number }) {
  return <img src="/forma_logo.png" alt="" aria-hidden="true" width={size} height={size} className="flex-shrink-0 object-contain" />;
}

function toChatMessages(rows: ChatHistoryMessage[]): ChatMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    suggestion: m.suggestion,
    clientMessageId: m.client_message_id ?? undefined,
  }));
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function todayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatSessionLabel(sessionDate: string): string {
  if (sessionDate === todayDateString()) return "Today's session.";
  const parsed = new Date(`${sessionDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Current session.';
  return `Session from ${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`;
}

export default function CoachPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const {
    messages,
    isStreaming,
    chatError,
    setMessages,
    appendMessage,
    removeMessage,
    appendStreamChunk,
    finalizeStream,
    patchMessage,
    setStreaming,
    setChatError,
    clearChat,
    healthSnapshot,
    weekPlan,
    setWeekPlan,
  } = useAppStore();

  const [draft, setDraft] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const [activeSessionDate, setActiveSessionDate] = useState<string | null>(null);
  // A message whose reply didn't arrive, with the id a retry sends: the same one
  // when the server never got it, a new one when its turn failed.
  const [failedTurn, setFailedTurn] = useState<{ prompt: string; clientMessageId: string } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptErrors, setAcceptErrors] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const abortStreamRef = useRef<(() => void) | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  // When the live stream last sent anything (pings included), to spot one that died quietly.
  const lastActivityRef = useRef(0);
  // The turn the live stream belongs to, for following it if the stream dies.
  const streamTurnRef = useRef<{ clientMessageId: string; prompt: string } | null>(null);
  const cancelFollowRef = useRef<(() => void) | null>(null);

  /**
   * Follow a turn by its id after its stream is gone: the server finishes it
   * regardless. On done the session reloads, so the reply, its card and any
   * cards it replaced come back exactly as saved.
   */
  const followTurn = useCallback(
    (assistantId: string, clientMessageId: string, prompt: string) => {
      const token = session?.access_token;
      if (!token) return;
      abortStreamRef.current?.();
      abortStreamRef.current = null;
      streamTurnRef.current = null;
      cancelFollowRef.current?.();
      let cancelled = false;
      cancelFollowRef.current = () => {
        cancelled = true;
      };
      streamingIdRef.current = assistantId;
      setStreaming(true);
      patchMessage(assistantId, {
        isStreaming: true,
        clientMessageId,
        progressLabel: FOLLOWING_LABEL,
        progressSince: Date.now(),
      });

      const giveUp = (message: string, retryId: string) => {
        removeMessage(assistantId);
        setStreaming(false);
        streamingIdRef.current = null;
        setChatError(message);
        setFailedTurn({ prompt, clientMessageId: retryId });
      };

      void (async () => {
        const startedAt = Date.now();
        while (!cancelled && Date.now() - startedAt < TURN_FOLLOW_LIMIT_MS) {
          try {
            const turn = await getChatTurn(token, clientMessageId);
            if (cancelled) return;
            if (turn.status === 'done') {
              if (turn.session_id) {
                const result = await getChatHistory(token, 100, 0, turn.session_id);
                if (cancelled) return;
                setMessages(toChatMessages(result.messages));
              } else {
                finalizeStream(assistantId);
              }
              setStreaming(false);
              streamingIdRef.current = null;
              cancelFollowRef.current = null;
              return;
            }
            if (turn.status === 'failed') {
              giveUp("That reply didn't come through. Try again.", newClientMessageId());
              return;
            }
          } catch (error) {
            if (cancelled) return;
            if (error instanceof ApiError && error.status === 404) {
              // It never reached the server, so sending it again is safe.
              giveUp("Your message didn't reach your coach. Try again.", clientMessageId);
              return;
            }
            // No connection: keep trying until the limit.
          }
          await wait(TURN_POLL_MS);
        }
        if (!cancelled) giveUp('No reply yet. Try again.', newClientMessageId());
      })();
    },
    [session, finalizeStream, patchMessage, removeMessage, setChatError, setMessages, setStreaming],
  );

  // Load the active (open) session's messages on first mount, and pick up a
  // turn that was still running (a reload, or coming back to Coach mid-reply).
  useEffect(() => {
    if (!session?.access_token) return;
    const pending = useAppStore.getState().messages.find((m) => m.isStreaming && m.clientMessageId);
    if (pending?.clientMessageId) {
      const prompt = [...useAppStore.getState().messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      followTurn(pending.id, pending.clientMessageId, prompt);
      return;
    }
    if (messages.length > 0) return;
    const token = session.access_token;
    void (async () => {
      try {
        const { sessions } = await getChatSessions(token, 5, 0);
        const activeSession = sessions.find((s) => s.status === 'open');
        if (!activeSession) return;
        setActiveSessionDate(activeSession.session_date);
        const result = await getChatHistory(token, 100, 0, activeSession.id);
        if (result.messages.length > 0) {
          setMessages(toChatMessages(result.messages));
          const running = runningTurnInHistory(result.messages);
          if (running) {
            const assistantId = `${running}-reply`;
            appendMessage({ id: assistantId, role: 'model', content: '', isStreaming: true, createdAt: new Date().toISOString() });
            followTurn(assistantId, running, result.messages[result.messages.length - 1].content);
          }
        }
      } catch {
        // Non-blocking
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Leaving Coach stops listening; coming back follows the turn instead (above).
  useEffect(
    () => () => {
      abortStreamRef.current?.();
      abortStreamRef.current = null;
      cancelFollowRef.current?.();
    },
    [],
  );

  // A stream that went quiet (a sleeping laptop, a dropped connection) is
  // swapped for following its turn. Checked on a timer and when the tab returns.
  useEffect(() => {
    const check = () => {
      const turn = streamTurnRef.current;
      const assistantId = streamingIdRef.current;
      if (!abortStreamRef.current || !turn || !assistantId) return;
      if (isStreamStalled(lastActivityRef.current, Date.now())) followTurn(assistantId, turn.clientMessageId, turn.prompt);
    };
    const timer = window.setInterval(check, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [followTurn]);

  // The side panel's "Today's plan" reads the store, which only Home fills.
  // Coming straight to Coach, load it here.
  useEffect(() => {
    if (weekPlan.length > 0 || !session?.access_token) return;
    let active = true;
    void getDashboard(session.access_token)
      .then((result) => {
        if (active) setWeekPlan(buildWeekPlan(result.data.active_workout_plan?.plan));
      })
      .catch(() => {
        // Non-blocking: the panel shows its empty state.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const isAtBottom = distanceFromBottom < 80;
    atBottomRef.current = isAtBottom;
    setAtBottom(isAtBottom);
  }, []);

  const streamReply = useCallback(
    (prompt: string, clientMessageId: string) => {
      if (!session?.access_token) {
        setChatError('You must be signed in to message your coach.');
        return;
      }
      setChatError(null);
      setFailedTurn(null);

      const assistantId = `${clientMessageId}-reply`;
      appendMessage({
        id: assistantId,
        role: 'model',
        content: '',
        isStreaming: true,
        clientMessageId,
        createdAt: new Date().toISOString(),
      });
      streamingIdRef.current = assistantId;
      streamTurnRef.current = { clientMessageId, prompt };
      lastActivityRef.current = Date.now();
      setStreaming(true);

      abortStreamRef.current = streamChat(session.access_token, prompt, {
        onActivity: () => {
          lastActivityRef.current = Date.now();
        },
        onProgress: ({ label, plan }) => {
          const current = useAppStore.getState().messages.find((m) => m.id === assistantId);
          patchMessage(assistantId, {
            progressLabel: label,
            progressSince: Date.now(),
            planBuilding: Boolean(current?.planBuilding) || plan,
          });
        },
        onTurnExists: () => followTurn(assistantId, clientMessageId, prompt),
        onChunk: (text) => {
          // The reply itself is arriving, so the progress line goes.
          if (useAppStore.getState().messages.find((m) => m.id === assistantId)?.progressLabel) {
            patchMessage(assistantId, { progressLabel: undefined });
          }
          appendStreamChunk(assistantId, text);
        },
        onSuggestion: ({ suggestion, replaces }) => {
          // Read the latest messages: chunks have landed since this closure.
          const current = useAppStore.getState().messages;
          const withCard = suggestion
            ? current.map((m) => (m.id === assistantId ? { ...m, suggestion } : m))
            : current;
          setMessages(markReplaced(withCard, replaces));
        },
        onDone: () => {
          finalizeStream(assistantId);
          streamingIdRef.current = null;
          abortStreamRef.current = null;
          streamTurnRef.current = null;
        },
        onError: (message, followable) => {
          abortStreamRef.current = null;
          if (followable) {
            // The server may well be finishing it; follow the turn rather than fail.
            followTurn(assistantId, clientMessageId, prompt);
            return;
          }
          removeMessage(assistantId);
          setStreaming(false);
          streamingIdRef.current = null;
          streamTurnRef.current = null;
          setChatError(message);
          // Refused before it started (a limit, validation), so the same id is safe.
          setFailedTurn({ prompt, clientMessageId });
        },
      }, { clientMessageId });
    },
    [session, appendMessage, appendStreamChunk, finalizeStream, followTurn, patchMessage, removeMessage, setChatError, setStreaming, setMessages],
  );

  const updateSuggestion = useCallback(
    (id: string, update: (s: PlanSuggestion) => PlanSuggestion) => {
      const current = useAppStore.getState().messages;
      setMessages(current.map((m) => (m.suggestion?.id === id ? { ...m, suggestion: update(m.suggestion) } : m)));
    },
    [setMessages],
  );

  const acceptSuggestion = useCallback(
    (suggestion: PlanSuggestion) => {
      if (!session?.access_token || acceptingId) return;
      const token = session.access_token;
      setAcceptingId(suggestion.id);
      setAcceptErrors((prev) => {
        const next = { ...prev };
        delete next[suggestion.id];
        return next;
      });
      void (async () => {
        try {
          const result = await acceptPlanSuggestion(token, suggestion.id);
          updateSuggestion(suggestion.id, (s) =>
            result.suggestion ? { ...result.suggestion } as PlanSuggestion : { ...s, status: 'accepted' },
          );
          // The plan changed: refresh what Coach's side panel (and Home) read.
          try {
            const dashboard = await getDashboard(token);
            setWeekPlan(buildWeekPlan(dashboard.data.active_workout_plan?.plan));
          } catch {
            // Home reloads the dashboard when opened.
          }
        } catch (error) {
          if (error instanceof ApiError && error.code === 'replaced') {
            updateSuggestion(suggestion.id, (s) => ({ ...s, status: 'replaced' }));
            return;
          }
          const message =
            error instanceof ApiError ? error.message : 'Could not save it. Check your connection and try again.';
          setAcceptErrors((prev) => ({ ...prev, [suggestion.id]: message }));
        } finally {
          setAcceptingId(null);
        }
      })();
    },
    [session, acceptingId, updateSuggestion, setWeekPlan],
  );

  // While the latest suggestion waits, the quick replies tweak it.
  const pendingSuggestion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const s = messages[i].suggestion;
      if (s) return s.status === 'pending' ? s : null;
    }
    return null;
  }, [messages]);
  const quickReplies = pendingSuggestion ? suggestionChips(pendingSuggestion) : QUICK_REPLIES;

  const sendMessage = useCallback(
    (presetText?: string) => {
      const value = (presetText ?? draft).trim();
      if (!value || isStreaming) return;
      const clientMessageId = newClientMessageId();
      appendMessage({
        id: clientMessageId,
        role: 'user',
        content: value,
        clientMessageId,
        createdAt: new Date().toISOString(),
      });
      setDraft('');
      atBottomRef.current = true;
      streamReply(value, clientMessageId);
    },
    [draft, isStreaming, appendMessage, streamReply],
  );

  const stopStreaming = useCallback(() => {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
    streamTurnRef.current = null;
    cancelFollowRef.current?.();
    cancelFollowRef.current = null;
    const id = streamingIdRef.current;
    if (id) {
      finalizeStream(id);
      streamingIdRef.current = null;
    } else {
      setStreaming(false);
    }
  }, [finalizeStream, setStreaming]);

  const startNewSession = useCallback(() => {
    if (isStreaming || startingSession || !session?.access_token) return;
    const token = session.access_token;
    const ok = window.confirm(
      'Start a new session? Your current conversation will be saved to history and the coach will start fresh.',
    );
    if (!ok) return;
    setStartingSession(true);
    setChatError(null);
    void (async () => {
      try {
        const { session: newSession } = await createChatSession(token);
        clearChat();
        setFailedTurn(null);
        setActiveSessionDate(newSession.session_date);
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Could not start a new session.');
      } finally {
        setStartingSession(false);
      }
    })();
  }, [isStreaming, startingSession, session, clearChat, setChatError]);

  // Only an older session needs saying; today's chat is just the Coach.
  const sessionSubtitle =
    activeSessionDate && activeSessionDate !== todayDateString() ? formatSessionLabel(activeSessionDate) : null;

  const todayWorkout = weekPlan.find((d) => d.status === 'today');
  const sleepLabel = healthSnapshot.sleep_hours != null ? `${healthSnapshot.sleep_hours}h` : '--';
  const hrLabel = healthSnapshot.resting_heart_rate != null ? `${healthSnapshot.resting_heart_rate} bpm` : '--';

  return (
    <div className="flex h-[calc(100dvh-74px-env(safe-area-inset-bottom))] min-h-0 md:h-[100dvh]">
      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-6 sm:px-10 sm:pt-8">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="type-screen-title m-0" style={{ color: 'var(--ink)' }}>
              Coach
            </h1>
            {sessionSubtitle ? (
              <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {sessionSubtitle}
              </p>
            ) : null}
          </div>
          <div className="-mr-2 flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/chat-history')}
              aria-label="Past chats"
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ color: 'var(--ink-2)' }}
            >
              <History size={22} aria-hidden />
            </button>
            <button
              type="button"
              onClick={startNewSession}
              disabled={isStreaming || startingSession}
              aria-label="New chat"
              className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50"
              style={{ color: 'var(--ink-2)' }}
            >
              <Plus size={22} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-10"
          >
            {chatError ? (
              <div
                className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{ background: 'var(--danger-tint)' }}
              >
                <span className="flex-1 text-[12.5px]" style={{ color: 'var(--forma-danger)' }}>
                  {chatError}
                </span>
                {failedTurn ? (
                  <Button
                    size="sm"
                    onClick={() => streamReply(failedTurn.prompt, failedTurn.clientMessageId)}
                    leftIcon={<RotateCcw size={13} color="var(--on-aqua)" />}
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}

            {messages.length === 0 && !chatError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <CoachAvatar size={44} />
                <div className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Your coach is ready
                </div>
                <p className="max-w-[360px] text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  Ask for a plan, tell me how your day is going, or tap a quick reply to get started.
                </p>
              </div>
            ) : null}

            {messages.map((message: ChatMessage) => {
              const isUser = message.role === 'user';
              return (
                <div key={message.id} className="flex flex-col gap-2.5">
                {isUser ? (
                  <div
                    className="max-w-[82%] self-end whitespace-pre-wrap px-[15px] py-[11px] text-[15px] leading-[21px] md:max-w-[560px]"
                    style={{ background: 'var(--ink)', color: 'var(--ground)', borderRadius: '20px 20px 6px 20px' }}
                  >
                    {message.content}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 md:max-w-[720px]">
                    <div className="flex items-center gap-2">
                      <CoachAvatar size={20} />
                      <span className="text-[13px] font-bold" style={{ color: 'var(--ink-2)' }}>
                        Coach
                      </span>
                    </div>
                    {message.isStreaming && message.content === '' ? (
                      <CoachWaiting label={message.progressLabel} since={message.progressSince} planBuilding={message.planBuilding} />
                    ) : (
                      <div className="text-[15.5px] leading-6" style={{ color: 'var(--ink)' }}>
                        <ChatMarkdown content={message.content} streaming={message.isStreaming} />
                      </div>
                    )}
                  </div>
                )}
                {!message.suggestion && message.isStreaming && message.planBuilding ? (
                  <div className="md:max-w-[880px]">
                    <PlanCardPlaceholder />
                  </div>
                ) : null}
                {message.suggestion ? (
                  <div className="md:max-w-[880px]">
                    <SuggestionCard
                      suggestion={message.suggestion}
                      accepting={acceptingId === message.suggestion.id}
                      error={acceptErrors[message.suggestion.id] ?? null}
                      onAccept={() => message.suggestion && acceptSuggestion(message.suggestion)}
                      onSeePlan={(day) => navigate(day ? `/plan/${day}` : '/')}
                    />
                  </div>
                ) : null}
                </div>
              );
            })}
          </div>

          {!atBottom && messages.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <button
                onClick={() => {
                  atBottomRef.current = true;
                  setAtBottom(true);
                  scrollToBottom();
                }}
                className="pointer-events-auto flex min-h-10 items-center gap-1.5 rounded-full px-3.5 shadow-md"
                style={{ background: 'var(--surface)' }}
              >
                <ArrowDown size={14} color="var(--text-primary)" />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Latest
                </span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Composer */}
        <div className="flex flex-col gap-2.5 px-4 pb-4 pt-2 sm:px-10 sm:pb-6">
          <div className="flex gap-2 overflow-x-auto">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => sendMessage(reply)}
                disabled={isStreaming}
                className="h-11 flex-none whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--sunken)', color: 'var(--ink)' }}
              >
                {reply}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 rounded-[26px] py-1 pl-[18px] pr-1" style={{ background: 'var(--surface)' }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={pendingSuggestion ? 'Tell me what to change' : 'Message your coach'}
              aria-label="Message your coach"
              rows={1}
              maxLength={2000}
              disabled={isStreaming}
              className="max-h-[120px] min-h-11 flex-1 resize-none bg-transparent py-[11px] text-[16px] leading-[22px] outline-none placeholder:text-[var(--ink-3)]"
              style={{ color: 'var(--ink)' }}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                aria-label="Stop generating"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--aqua)' }}
              >
                <Square size={15} color="var(--on-aqua)" fill="var(--on-aqua)" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={draft.trim().length === 0}
                aria-label="Send"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: draft.trim().length === 0 ? 'var(--sunken)' : 'var(--aqua)' }}
              >
                <ArrowUp size={20} strokeWidth={2.6} color={draft.trim().length === 0 ? 'var(--ink-3)' : 'var(--on-aqua)'} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Context panel (wide screens) */}
      <aside
        className="hidden h-full w-[340px] min-w-[340px] flex-col gap-4 overflow-y-auto p-5 xl:flex"
        style={{ borderLeft: '1px solid var(--border-base)', background: 'var(--bg-app)' }}
      >
        <Eyebrow>Today&rsquo;s snapshot</Eyebrow>
        <Card>
          <div className="flex gap-2.5">
            <StatTile value={sleepLabel} label="Sleep" />
            <StatTile value={hrLabel} label="Resting HR" />
          </div>
        </Card>

        <Eyebrow className="mt-1.5">Today&rsquo;s plan</Eyebrow>
        <Card>
          {todayWorkout && todayWorkout.title !== 'Rest' ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <strong className="text-[14.5px]" style={{ color: 'var(--text-primary)' }}>
                  {todayWorkout.title}
                </strong>
                <Badge tone="mint">{todayWorkout.duration}</Badge>
              </div>
              <p className="mb-3 text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                Tuned to how you feel today.
              </p>
              <Button variant="quiet" fullWidth size="sm" onClick={() => navigate(`/plan/${todayWorkout.key}`)}>
                View full plan
              </Button>
            </>
          ) : (
            <p className="text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              No workout scheduled today. Ask your coach to build one.
            </p>
          )}
        </Card>

        <Eyebrow className="mt-1.5">Quick actions</Eyebrow>
        <Card variant="subtle" padding="8px">
          <button
            onClick={() => navigate('/')}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left hover:bg-[var(--bg-surface)]"
          >
            <Calendar size={16} color="var(--icon-sleep)" />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              View this week&rsquo;s plan
            </span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left hover:bg-[var(--bg-surface)]"
          >
            <Activity size={16} color="var(--icon-sleep)" />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Log a pulse check
            </span>
          </button>
        </Card>
      </aside>
    </div>
  );
}
