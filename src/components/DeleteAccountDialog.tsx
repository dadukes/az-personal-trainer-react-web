import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Input } from '@/components/ui';

/**
 * What `DELETE /account` actually removes. Kept here as the single wording used by
 * both the in-app flow and the public deletion page, because Google Play's policy
 * requires the two to describe the same thing.
 */
export const DELETED_DATA: string[] = [
  'Your profile, goals, limitations and coach settings',
  'Every coach conversation, session summary and remembered fact',
  'Workout plans, logged sessions and per-set history',
  'Health, nutrition and activity logs',
  'XP, level and streak progress',
];

/** The word the user has to type before the destructive action unlocks. */
const CONFIRM_WORD = 'DELETE';

interface DeleteAccountDialogProps {
  /** Shown above the confirmation field — the account being deleted. */
  email?: string;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirm-and-delete for an irreversible account wipe. Type-to-confirm rather than a
 * plain "Are you sure?": there is no recovery window and no soft delete server-side,
 * so a mis-tap must not be enough.
 */
export default function DeleteAccountDialog({
  email,
  submitting,
  error,
  onConfirm,
  onClose,
}: DeleteAccountDialogProps) {
  const [typed, setTyped] = useState('');
  const canDelete = typed.trim().toUpperCase() === CONFIRM_WORD && !submitting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-5"
      style={{ background: 'rgba(6,34,77,0.45)' }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete your account?"
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[460px] rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-subtle)' }}
          >
            <AlertTriangle size={18} color="var(--forma-danger)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Delete your account?
            </div>
            <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
              This is permanent and takes effect immediately. There is no recovery window and no
              backup we can restore from{email ? ` for ${email}` : ''}.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg p-1 disabled:opacity-40"
          >
            <X size={18} color="var(--text-muted)" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--bg-subtle)' }}>
          <span
            className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: 'var(--text-label)' }}
          >
            What gets deleted
          </span>
          <ul className="flex flex-col gap-1.5">
            {DELETED_DATA.map((item) => (
              <li
                key={item}
                className="flex gap-2 text-[13px] leading-[1.5]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span aria-hidden style={{ color: 'var(--forma-danger)' }}>
                  &bull;
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <Input
            label={`Type ${CONFIRM_WORD} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={submitting}
          />
        </div>

        {error ? (
          <div className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5">
          <Button variant="danger" fullWidth disabled={!canDelete} onClick={onConfirm}>
            {submitting ? 'Deleting…' : 'Delete my account'}
          </Button>
          <Button variant="ghost" fullWidth disabled={submitting} onClick={onClose}>
            Keep my account
          </Button>
        </div>
      </div>
    </div>
  );
}
