import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import {
  createUserMemory,
  deleteUserMemory,
  getUserMemory,
  updateUserMemory,
  type UserMemoryItem,
} from '@/lib/api';

/**
 * "What your coach remembers" — the user's window onto the AI's global memory.
 *
 * These are the exact rows the backend pastes into the coach's system instruction
 * on every chat turn, so an edit here changes what the coach believes on the very
 * next message. That is the point: memory a user cannot correct is memory they
 * have to work around.
 *
 * Each row saves itself (`PATCH`/`DELETE /profile/memory/{id}`) rather than
 * joining the profile form's `Save changes` — a half-saved memory list is worse
 * than an immediate one. It also owns its own fetch instead of reading the
 * cached Zustand profile, which is stale-while-revalidate while memory changes
 * on every session rollover.
 */

/** Matches the per-fact cap the backend enforces (413 `memory_content_too_long`). */
const MAX_MEMORY_CHARS = 500;

/** "Until Aug 8" for a temporary fact; empty for permanent ones. */
function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return '';
  return `Until ${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const textareaClass =
  'w-full resize-y rounded-xl px-3.5 py-2.5 text-[14.5px] leading-6 outline-none transition-colors placeholder:opacity-70 focus:border-[var(--accent)]';

const textareaStyle = {
  minHeight: 88,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-base)',
  color: 'var(--text-primary)',
} as const;

interface Props {
  accessToken: string | undefined;
}

export default function CoachMemory({ accessToken }: Props) {
  const [items, setItems] = useState<UserMemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // One row at a time is in edit or confirm-forget mode; `busyId` disables the
  // row while its request is in flight.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setLoadError('Your session is missing. Sign in again to see what your coach remembers.');
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const { memory } = await getUserMemory(accessToken);
        if (active) setItems(memory ?? []);
      } catch (err) {
        if (active) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load your coach memory.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, reloadToken]);

  const startEdit = (item: UserMemoryItem) => {
    setActionError(null);
    setConfirmingId(null);
    setEditingId(item.id);
    setDraft(item.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const handleSaveEdit = async (item: UserMemoryItem) => {
    const content = draft.trim();
    if (!accessToken || !content || content === item.content) {
      cancelEdit();
      return;
    }
    setActionError(null);
    setBusyId(item.id);
    try {
      const { memory } = await updateUserMemory(accessToken, item.id, { content });
      setItems((prev) => prev.map((m) => (m.id === item.id ? memory : m)));
      cancelEdit();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save that change.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: UserMemoryItem) => {
    if (!accessToken) return;
    setActionError(null);
    setBusyId(item.id);
    try {
      await deleteUserMemory(accessToken, item.id);
      setItems((prev) => prev.filter((m) => m.id !== item.id));
      setConfirmingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to remove that memory.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async () => {
    const content = newContent.trim();
    if (!accessToken || !content) return;
    setActionError(null);
    setSavingNew(true);
    try {
      const { memory } = await createUserMemory(accessToken, { content });
      setItems((prev) => [...prev, memory]);
      setNewContent('');
      setAdding(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to add that memory.');
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <Card padding="24px">
      <Eyebrow className="mb-2">What your coach remembers</Eyebrow>
      <p className="mb-5 text-[13px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
        Forma keeps these notes between chats and uses them in every reply. Fix anything that&apos;s
        wrong or out of date — edits here save on their own and apply to your next message.
      </p>

      {loading ? (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Loading…
        </p>
      ) : loadError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
            {loadError}
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RotateCcw size={14} />}
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
          Nothing saved yet. Your coach starts keeping notes after a few conversations — or add
          something yourself below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const isConfirming = confirmingId === item.id;
            const busy = busyId === item.id;
            const expiry = formatExpiry(item.expires_at);

            return (
              <li
                key={item.id}
                className="rounded-2xl p-3.5 transition-opacity"
                style={{
                  background: 'var(--bg-subtle)',
                  border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border-base)'}`,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={MAX_MEMORY_CHARS}
                      disabled={busy}
                      autoFocus
                      aria-label="Edit memory"
                      placeholder="What should your coach remember?"
                      className={textareaClass}
                      style={textareaStyle}
                    />
                    <div className="flex justify-end gap-2.5">
                      <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={busy}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        leftIcon={<Check size={15} strokeWidth={3} />}
                        onClick={() => void handleSaveEdit(item)}
                        disabled={busy || !draft.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[14.5px] leading-[1.45]" style={{ color: 'var(--text-primary)' }}>
                      {item.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.origin === 'user' ? <Badge>Added by you</Badge> : null}
                      {expiry ? <Badge>{expiry}</Badge> : null}
                      {item.category ? <Badge>{item.category}</Badge> : null}
                      <div className="flex-1" />
                      {isConfirming ? (
                        <>
                          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                            Forget this?
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmingId(null)}
                            disabled={busy}
                          >
                            Keep
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Trash2 size={14} color="var(--forma-danger)" />}
                            style={{ color: 'var(--forma-danger)', borderColor: 'var(--forma-danger)' }}
                            onClick={() => void handleDelete(item)}
                            disabled={busy}
                          >
                            Forget
                          </Button>
                        </>
                      ) : (
                        <>
                          <IconButton label="Edit memory" onClick={() => startEdit(item)}>
                            <Pencil size={15} color="var(--text-secondary)" />
                          </IconButton>
                          <IconButton
                            label="Forget memory"
                            onClick={() => {
                              setActionError(null);
                              setEditingId(null);
                              setConfirmingId(item.id);
                            }}
                          >
                            <Trash2 size={15} color="var(--forma-danger)" />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actionError ? (
        <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
          {actionError}
        </p>
      ) : null}

      {!loading && !loadError ? (
        <div className="mt-5">
          {adding ? (
            <div className="flex flex-col gap-3">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                maxLength={MAX_MEMORY_CHARS}
                autoFocus
                aria-label="Something for your coach to remember"
                placeholder="e.g. I train best before 7am"
                className={textareaClass}
                style={{ ...textareaStyle, background: 'var(--bg-subtle)' }}
              />
              <div className="flex justify-end gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setNewContent('');
                  }}
                  disabled={savingNew}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  leftIcon={<Check size={15} strokeWidth={3} />}
                  onClick={() => void handleAdd()}
                  disabled={savingNew || !newContent.trim()}
                >
                  {savingNew ? 'Saving…' : 'Add'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={15} />}
              onClick={() => {
                setActionError(null);
                setAdding(true);
              }}
            >
              Add something
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-transform active:scale-[0.94]"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      {children}
    </button>
  );
}
