import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import ChatMarkdown from '@/components/ChatMarkdown';
import { chatMeta, chatSummary, chatTakeaways, chatTitle, groupChats } from '@/lib/chatHistory';
import { historyLine } from '@/lib/planSuggestion';
import { localISODate } from '@/lib/workout';
import {
  getChatHistory,
  getChatSessions,
  type ChatHistoryMessage,
  type ChatSession,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const PAGE = 30;

/** Set when a session was opened by tapping the list, so Back can pop to it. */
interface OpenedFromList {
  fromList: true;
}

export default function ChatHistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  // The open session lives in the URL (`?session=<id>`). Below `lg` the list and the
  // transcript are two screens, and a real history entry is what makes the browser's
  // (and Android's) Back return to the list instead of leaving the page.
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('session');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Below md the document is the scroller, so the list's position survives a trip into
  // a transcript only if we put it back.
  const listScrollRef = useRef(0);

  useEffect(() => {
    window.scrollTo(0, openId ? 0 : listScrollRef.current);
  }, [openId]);

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let active = true;
    void (async () => {
      try {
        const { sessions: list } = await getChatSessions(token, PAGE, 0);
        if (active) {
          setSessions(list);
          setHasMore(list.length === PAGE);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your chat history.');
      } finally {
        if (active) setLoadingSessions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session]);

  // Side by side (lg+) there is always room for a transcript, so with nothing opened
  // explicitly it shows the most recent closed session. On a phone that fallback stays
  // hidden until a session is tapped.
  const selected =
    sessions.find((s) => s.id === openId) ??
    (openId ? undefined : sessions.find((s) => s.status === 'closed'));
  const selectedId = selected?.id;

  useEffect(() => {
    if (!selectedId || !session?.access_token) return;
    const token = session.access_token;
    let active = true;
    setMessages([]);
    setLoadingMessages(true);
    void (async () => {
      try {
        const result = await getChatHistory(token, 200, 0, selectedId);
        if (active) setMessages(result.messages);
      } catch {
        if (active) setMessages([]);
      } finally {
        if (active) setLoadingMessages(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedId, session]);

  const openSession = (id: string) => {
    if (id === openId) return;
    // Switching sessions from the transcript-side list (lg+) replaces the entry, so Back
    // leaves the page rather than stepping through every session that was clicked.
    const state: OpenedFromList | undefined = openId ? undefined : { fromList: true };
    if (!openId) listScrollRef.current = window.scrollY;
    setSearchParams({ session: id }, { replace: Boolean(openId), state });
  };

  const handleBack = () => {
    if (!openId) {
      navigate('/coach');
      return;
    }
    // Pop back to the list when we pushed the transcript; a deep link has nothing to pop.
    if ((location.state as OpenedFromList | null)?.fromList) navigate(-1);
    else setSearchParams({}, { replace: true });
  };

  const loadMore = async () => {
    if (!session?.access_token || loadingMore) return;
    setLoadingMore(true);
    try {
      const { sessions: more } = await getChatSessions(session.access_token, PAGE, sessions.length);
      setSessions((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
      setHasMore(more.length === PAGE);
    } catch {
      // Keep what's shown; the button stays for another try.
    } finally {
      setLoadingMore(false);
    }
  };

  const { today, groups } = groupChats(sessions, localISODate());
  const empty = !loadingSessions && !error && !today && groups.length === 0;
  const takeaways = selected ? chatTakeaways(selected) : [];
  const summary = selected ? chatSummary(selected) : null;

  const list = (
    <div className="flex flex-col gap-5">
      {today ? (
        <button type="button" onClick={() => navigate('/coach')} className="flex items-center gap-3 rounded-[20px] p-4 text-left" style={{ background: 'var(--surface)' }}>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Today&apos;s chat</span>
            <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {today.message_count} {today.message_count === 1 ? 'message' : 'messages'} · still going
            </span>
          </span>
          <span className="flex min-h-10 items-center rounded-full px-3.5 text-[14px] font-bold" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
            Continue
          </span>
        </button>
      ) : null}
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2.5">
          <h2 className="type-section-title m-0 px-1" style={{ color: 'var(--ink)' }}>{group.title}</h2>
          <div className="overflow-hidden rounded-[20px]" style={{ background: 'var(--surface)' }}>
            {group.sessions.map((s, i) => {
              const line = chatSummary(s);
              const on = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s.id)}
                  aria-current={on ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-[var(--sunken)] ${on ? 'lg:bg-[var(--sunken)]' : ''}`}
                  style={{ borderTop: i === 0 ? undefined : '1px solid var(--line)' }}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{chatTitle(s)}</span>
                    {line ? <span className="line-clamp-2 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>{line}</span> : null}
                    <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{chatMeta(s)}</span>
                  </span>
                  <ChevronRight size={16} color="var(--ink-3)" aria-hidden="true" className="lg:hidden" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {hasMore ? (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="h-12 rounded-2xl text-[15px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
          {loadingMore ? 'Loading…' : 'Show older chats'}
        </button>
      ) : null}
    </div>
  );

  const transcript = selected ? (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>{chatMeta(selected)}</span>
        <h2 className="m-0 text-[22px] font-bold leading-7" style={{ color: 'var(--ink)' }}>{chatTitle(selected)}</h2>
      </header>
      {summary || takeaways.length ? (
        <section aria-label="What came out of it" className="flex flex-col gap-2 rounded-[20px] p-4" style={{ background: 'var(--surface)' }}>
          <h3 className="m-0 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>What came out of it</h3>
          {summary ? <p className="m-0 text-[15px] leading-[22px]" style={{ color: 'var(--ink-2)' }}>{summary}</p> : null}
          {takeaways.length ? (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-[22px]" style={{ color: 'var(--ink)' }}>
              {takeaways.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {loadingMessages ? (
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              {m.role === 'user' ? (
                <div className="max-w-[82%] self-end rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-[21px]" style={{ background: 'var(--ink)', color: 'var(--ground)' }}>
                  {m.content}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: 'var(--ink-2)' }}>
                    <img src="/forma_logo.png" alt="" className="h-5 w-5" /> Coach
                  </span>
                  <ChatMarkdown content={m.content} />
                </div>
              )}
              {m.suggestion ? (
                <div className="rounded-[14px] px-3.5 py-2.5 text-[13.5px] font-semibold" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>
                  {historyLine(m.suggestion)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <footer className="flex flex-col gap-2.5 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <p className="m-0 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
          This chat has closed. Anything worth keeping went into what your coach remembers.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/profile')} className="min-h-[44px] rounded-full px-4 text-[14px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
            See what it remembers
          </button>
          <button type="button" onClick={() => navigate('/coach')} className="min-h-[44px] rounded-full px-4 text-[14px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
            Go to today&apos;s chat
          </button>
        </div>
      </footer>
    </div>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] animate-fade-slide-up flex-col gap-5 px-4 pb-16 pt-5 sm:px-10 sm:pt-8">
      <div className="flex items-center gap-1">
        <button type="button" onClick={handleBack} aria-label={openId ? 'Back to past chats' : 'Back to Coach'} className="-ml-2.5 flex h-11 w-11 items-center justify-center">
          <ChevronLeft size={24} color="var(--ink)" aria-hidden="true" />
        </button>
        <h1 className="type-screen-title m-0" style={{ color: 'var(--ink)' }}>Past chats</h1>
      </div>

      {error ? (
        <p role="alert" className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>{error}</p>
      ) : loadingSessions ? (
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>Loading…</p>
      ) : empty ? (
        <section aria-label="No past chats yet" className="mx-auto flex max-w-[480px] flex-col items-center gap-3.5 rounded-[24px] p-6 text-center" style={{ background: 'var(--surface)' }}>
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--tint)' }}>
            <MessageSquare size={24} color="var(--teal)" />
          </span>
          <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>Your chats will collect here</h2>
          <p className="m-0 text-[15px] leading-[22px]" style={{ color: 'var(--ink-2)' }}>
            Each day&apos;s conversation with your coach lands here once the day is over, with a one-line summary, so you can look back at what you agreed.
          </p>
          <button type="button" onClick={() => navigate('/coach')} className="h-12 rounded-2xl px-5 text-[15px] font-bold" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
            Talk to your coach
          </button>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          {/* Below lg the list and a transcript are two screens; side by side from lg. */}
          <div className={openId ? 'hidden lg:block' : ''}>{list}</div>
          <div className={openId ? '' : 'hidden lg:block'}>{transcript}</div>
        </div>
      )}
    </div>
  );
}
