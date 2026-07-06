import { ChevronLeft, MessageSquare, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ChatMarkdown from '@/components/ChatMarkdown';
import { Badge, Card, Eyebrow } from '@/components/ui';
import {
  getChatHistory,
  getChatSessions,
  type ChatHistoryMessage,
  type ChatSession,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

function formatSessionDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ChatHistoryPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    void (async () => {
      try {
        const { sessions: list } = await getChatSessions(token, 50, 0);
        setSessions(list);
        const firstClosed = list.find((s) => s.status === 'closed') ?? list[0];
        if (firstClosed) setSelected(firstClosed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your chat history.');
      } finally {
        setLoadingSessions(false);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!selected || !session?.access_token) return;
    const token = session.access_token;
    setLoadingMessages(true);
    void (async () => {
      try {
        const result = await getChatHistory(token, 200, 0, selected.id);
        setMessages(result.messages);
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [selected, session]);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/coach')}
          aria-label="Back to coach"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div>
          <Eyebrow>Coach</Eyebrow>
          <div className="text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            Chat history
          </div>
        </div>
      </div>

      {error ? (
        <Card>
          <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Session list */}
          <div className="flex flex-col gap-2.5 lg:w-[340px] lg:min-w-[340px]">
            {loadingSessions ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : sessions.length === 0 ? (
              <Card>
                <p className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
                  No past sessions yet. Your saved coach conversations will appear here.
                </p>
              </Card>
            ) : (
              sessions.map((s) => {
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
                    style={{
                      background: active ? 'var(--bg-selected)' : 'var(--bg-surface)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-base)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate text-[14px] font-bold"
                        style={{ color: active ? 'var(--text-on-mint)' : 'var(--text-primary)' }}
                      >
                        {s.title ?? formatSessionDate(s.session_date)}
                      </span>
                      {s.status === 'open' ? <Badge tone="mint">Open</Badge> : null}
                    </div>
                    <div
                      className="mt-1 text-[12px]"
                      style={{ color: active ? 'rgba(14,76,69,.75)' : 'var(--text-muted)' }}
                    >
                      {formatSessionDate(s.session_date)} · {s.message_count} messages
                    </div>
                    {s.summary_json?.one_line || s.summary ? (
                      <p
                        className="mt-2 line-clamp-2 text-[12.5px] leading-[1.45]"
                        style={{ color: active ? 'rgba(14,76,69,.85)' : 'var(--text-secondary)' }}
                      >
                        {s.summary_json?.one_line ?? s.summary}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {/* Selected transcript (read-only) */}
          <Card className="flex-1" padding="0">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 p-16 text-center">
                <MessageSquare size={24} color="var(--text-muted)" />
                <p className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
                  Select a session to read the conversation.
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-base)' }}>
                  <div className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {selected.title ?? formatSessionDate(selected.session_date)}
                  </div>
                  <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {formatSessionDate(selected.session_date)}
                  </div>
                </div>
                <div className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto p-5">
                  {loadingMessages ? (
                    <div className="flex justify-center py-10">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="py-6 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                      No messages in this session.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const isUser = m.role === 'user';
                      return (
                        <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {!isUser ? (
                            <div
                              className="mr-2 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)' }}
                            >
                              <Zap size={13} color="#34D2C1" />
                            </div>
                          ) : null}
                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-3 md:max-w-[560px] ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                            style={{
                              background: isUser ? 'var(--accent)' : 'var(--bg-subtle)',
                              color: isUser ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                              border: isUser ? 'none' : '1px solid var(--border-base)',
                            }}
                          >
                            {isUser ? (
                              <span className="text-[14px] leading-6">{m.content}</span>
                            ) : (
                              <ChatMarkdown content={m.content} />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
