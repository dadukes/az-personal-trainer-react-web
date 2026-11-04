import { Activity, ArrowDown, Calendar, History, Plus, RotateCcw, SendHorizontal, Square, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ChatMarkdown from '@/components/ChatMarkdown';
import SuggestionCard from '@/components/SuggestionCard';
import TypingDots from '@/components/TypingDots';
import { Badge, Button, Card, Eyebrow, StatTile } from '@/components/ui';
import {
  acceptPlanSuggestion,
  ApiError,
  createChatSession,
  getChatHistory,
  getChatSessions,
  getDashboard,
  streamChat,
  type PlanSuggestion,
} from '@/lib/api';
import { markReplaced, suggestionChips } from '@/lib/planSuggestion';
import { buildWeekPlan } from '@/lib/workout';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore, type ChatMessage } from '@/store/useAppStore';

const QUICK_REPLIES = ['Let’s do it.', 'Still too much today.', 'What should I focus on?'];

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
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptErrors, setAcceptErrors] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const abortStreamRef = useRef<(() => void) | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  // Load the active (open) session's messages on first mount.
  useEffect(() => {
    if (messages.length > 0 || !session?.access_token) return;
    const token = session.access_token;
    void (async () => {
      try {
        const { sessions } = await getChatSessions(token, 5, 0);
        const activeSession = sessions.find((s) => s.status === 'open');
        if (!activeSession) return;
        setActiveSessionDate(activeSession.session_date);
        const result = await getChatHistory(token, 100, 0, activeSession.id);
        if (result.messages.length > 0) {
          setMessages(
            result.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.created_at,
              suggestion: m.suggestion,
            })),
          );
        }
      } catch {
        // Non-blocking
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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
    (prompt: string) => {
      if (!session?.access_token) {
        setChatError('You must be signed in to message your coach.');
        return;
      }
      setChatError(null);
      setFailedPrompt(null);

      const assistantId = `${Date.now()}-reply`;
      appendMessage({
        id: assistantId,
        role: 'model',
        content: '',
        isStreaming: true,
        createdAt: new Date().toISOString(),
      });
      streamingIdRef.current = assistantId;
      setStreaming(true);

      abortStreamRef.current = streamChat(session.access_token, prompt, {
        onChunk: (text) => appendStreamChunk(assistantId, text),
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
        },
        onError: (message) => {
          removeMessage(assistantId);
          setStreaming(false);
          streamingIdRef.current = null;
          abortStreamRef.current = null;
          setChatError(message);
          setFailedPrompt(prompt);
        },
      });
    },
    [session, appendMessage, appendStreamChunk, finalizeStream, removeMessage, setChatError, setStreaming, setMessages],
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
      appendMessage({
        id: Date.now().toString(),
        role: 'user',
        content: value,
        createdAt: new Date().toISOString(),
      });
      setDraft('');
      atBottomRef.current = true;
      streamReply(value);
    },
    [draft, isStreaming, appendMessage, streamReply],
  );

  const stopStreaming = useCallback(() => {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
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
        setFailedPrompt(null);
        setActiveSessionDate(newSession.session_date);
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Could not start a new session.');
      } finally {
        setStartingSession(false);
      }
    })();
  }, [isStreaming, startingSession, session, clearChat, setChatError]);

  const sessionSubtitle = useMemo(() => {
    if (activeSessionDate) return formatSessionLabel(activeSessionDate);
    if (messages.length > 0) return "Today's session.";
    return 'Conversational guidance that adapts to your day.';
  }, [activeSessionDate, messages.length]);

  const todayWorkout = weekPlan.find((d) => d.status === 'today');
  const sleepLabel = healthSnapshot.sleep_hours != null ? `${healthSnapshot.sleep_hours}h` : '--';
  const hrLabel = healthSnapshot.resting_heart_rate != null ? `${healthSnapshot.resting_heart_rate} bpm` : '--';

  return (
    <div className="flex h-[calc(100dvh-74px-env(safe-area-inset-bottom))] min-h-0 md:h-[100dvh]">
      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-10 sm:pt-8" style={{ borderBottom: '1px solid var(--border-base)' }}>
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold sm:text-[26px]" style={{ color: 'var(--text-primary)' }}>
              Coach
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
              {sessionSubtitle}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={() => navigate('/chat-history')}
              aria-label="View chat history"
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
            >
              <History size={18} color="var(--text-primary)" />
            </button>
            <button
              onClick={startNewSession}
              disabled={isStreaming || startingSession}
              aria-label="Start a new session"
              className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
            >
              <Plus size={18} color="var(--text-primary)" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex h-full flex-col gap-3.5 overflow-y-auto px-5 py-6 sm:px-10"
          >
            {chatError ? (
              <div
                className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{ background: 'var(--danger-tint)' }}
              >
                <span className="flex-1 text-[12.5px]" style={{ color: 'var(--forma-danger)' }}>
                  {chatError}
                </span>
                {failedPrompt ? (
                  <Button size="sm" onClick={() => streamReply(failedPrompt)} leftIcon={<RotateCcw size={13} color="var(--on-aqua)" />}>
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}

            {messages.length === 0 && !chatError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)' }}
                >
                  <Zap size={20} color="var(--teal)" />
                </div>
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
                <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser ? (
                    <div
                      className="mr-2 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)' }}
                    >
                      <Zap size={13} color="var(--teal)" />
                    </div>
                  ) : null}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 md:max-w-[640px] ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      background: isUser ? 'var(--accent)' : 'var(--bg-surface)',
                      color: isUser ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                      border: isUser ? 'none' : '1px solid var(--border-base)',
                    }}
                  >
                    {isUser ? (
                      <span className="text-[14px] leading-6">{message.content}</span>
                    ) : message.isStreaming && message.content === '' ? (
                      <TypingDots color="var(--teal)" />
                    ) : (
                      <ChatMarkdown content={message.content} streaming={message.isStreaming} />
                    )}
                  </div>
                </div>
                {message.suggestion ? (
                  <div className="sm:ml-10 md:max-w-[880px]">
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
                className="pointer-events-auto flex items-center gap-1.5 rounded-full px-3.5 py-2 shadow-md"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
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
        <div className="px-5 pb-5 pt-3.5 sm:px-10" style={{ borderTop: '1px solid var(--border-base)', background: 'var(--bg-surface)' }}>
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => sendMessage(reply)}
                disabled={isStreaming}
                className="whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
              >
                {reply}
              </button>
            ))}
          </div>
          <div
            className="flex items-end gap-2.5 rounded-[24px] px-4 py-2.5"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
          >
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
              className="max-h-[120px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                aria-label="Stop generating"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--accent)' }}
              >
                <Square size={15} color="var(--on-aqua)" fill="var(--on-aqua)" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage()}
                disabled={draft.trim().length === 0}
                aria-label="Send message"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <SendHorizontal size={16} color="var(--on-aqua)" />
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
