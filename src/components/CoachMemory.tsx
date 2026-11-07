import { Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

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

/** Notes shown before "Show all": the list grows with every chat. */
const VISIBLE_NOTES = 5;

/** "fitness_level" → "Fitness level". */
function categoryLabel(category: string | null | undefined): string {
  const text = (category ?? '').replace(/_/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

/** "Until Aug 8" for a temporary fact; empty for permanent ones. */
function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return '';
  return `Until ${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const textareaClass = 'w-full resize-y rounded-xl px-3 py-2.5 text-[15px] leading-[21px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]';

const textareaStyle = { minHeight: 84, background: 'var(--ground)', color: 'var(--ink)' } as const;

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

  const [showAll, setShowAll] = useState(false);
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

  const textButton = (label: string, color: string, onClick: () => void, disabled?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[44px] px-2.5 text-[15px] font-bold disabled:opacity-45"
      style={{ color }}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="What your coach remembers" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1 px-1">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>What your coach remembers</h2>
        <p className="m-0 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
          Notes it keeps between chats and reads before every reply. Select one to fix or forget it. Changes save on their own.
        </p>
      </div>
      <div className="overflow-hidden rounded-[20px]" style={{ background: 'var(--surface)' }}>
        {loading ? (
          <p className="m-0 p-4 text-[15px]" style={{ color: 'var(--ink-2)' }}>Loading…</p>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-2 p-4">
            <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadToken((t) => t + 1)}
              className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-bold"
              style={{ color: 'var(--teal)' }}
            >
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
          </div>
        ) : (
          <>
            {items.length === 0 ? (
              <p className="m-0 p-4 text-[15px] leading-[22px]" style={{ color: 'var(--ink-2)' }}>
                Nothing yet. After a few chats your coach starts keeping notes, like the times you like to train. You can add one yourself too.
              </p>
            ) : null}
            {(showAll ? items : items.slice(0, VISIBLE_NOTES)).map((item, index) => {
              const isEditing = editingId === item.id;
              const isConfirming = confirmingId === item.id;
              const busy = busyId === item.id;
              const tag = item.origin === 'user' ? 'Added by you' : formatExpiry(item.expires_at) || categoryLabel(item.category);
              return (
                <div key={item.id} style={{ borderTop: index === 0 ? undefined : '1px solid var(--line)', opacity: busy ? 0.6 : 1 }}>
                  {isEditing ? (
                    <div className="flex flex-col gap-2.5 p-3">
                      <label className="sr-only" htmlFor={`mem-${item.id}`}>Change this note</label>
                      <textarea
                        id={`mem-${item.id}`}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={MAX_MEMORY_CHARS}
                        disabled={busy}
                        autoFocus
                        className={textareaClass}
                        style={textareaStyle}
                      />
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <span className="flex-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>Forget this note?</span>
                          {textButton('Keep', 'var(--ink)', () => setConfirmingId(null), busy)}
                          {textButton('Forget', 'var(--danger)', () => void handleDelete(item), busy)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {textButton('Forget this', 'var(--danger)', () => setConfirmingId(item.id), busy)}
                          <span className="flex-1" />
                          {textButton('Cancel', 'var(--ink)', cancelEdit, busy)}
                          {textButton('Save', 'var(--teal)', () => void handleSaveEdit(item), busy || !draft.trim())}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      aria-label={`Change or forget: ${item.content}`}
                      className="flex min-h-[52px] w-full flex-col gap-1 px-4 py-3 text-left hover:bg-[var(--sunken)]"
                    >
                      <span className="text-[15px] leading-[22px]" style={{ color: 'var(--ink)' }}>{item.content}</span>
                      {tag ? <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>{tag}</span> : null}
                    </button>
                  )}
                </div>
              );
            })}
            {items.length > VISIBLE_NOTES ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="flex min-h-12 w-full items-center px-4 text-[15px] font-bold hover:bg-[var(--sunken)]"
                style={{ color: 'var(--ink-2)', borderTop: '1px solid var(--line)' }}
              >
                {showAll ? 'Show fewer' : `Show all ${items.length} notes`}
              </button>
            ) : null}
            {adding ? (
              <div className="flex flex-col gap-2.5 p-3" style={{ borderTop: items.length ? '1px solid var(--line)' : undefined }}>
                <label className="sr-only" htmlFor="mem-new">Something for your coach to remember</label>
                <textarea
                  id="mem-new"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  maxLength={MAX_MEMORY_CHARS}
                  autoFocus
                  placeholder="e.g. I train best before 7am"
                  className={textareaClass}
                  style={textareaStyle}
                />
                <div className="flex justify-end gap-1">
                  {textButton('Cancel', 'var(--ink)', () => {
                    setAdding(false);
                    setNewContent('');
                  }, savingNew)}
                  {textButton(savingNew ? 'Saving…' : 'Add', 'var(--teal)', () => void handleAdd(), savingNew || !newContent.trim())}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setAdding(true);
                }}
                className="flex min-h-[52px] w-full items-center gap-2 px-4 text-[15px] font-bold hover:bg-[var(--sunken)]"
                style={{ color: 'var(--teal)', borderTop: items.length ? '1px solid var(--line)' : undefined }}
              >
                <Plus size={17} aria-hidden="true" /> Add something to remember
              </button>
            )}
          </>
        )}
      </div>
      {actionError ? <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--danger)' }}>{actionError}</p> : null}
    </section>
  );
}
