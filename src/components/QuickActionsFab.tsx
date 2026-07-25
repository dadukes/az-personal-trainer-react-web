import { Plus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export interface QuickAction {
  /** Stable id — also the React key. */
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * The single "log something" entry point: a floating action button that fans out
 * into the manual-capture actions (activity + health). It sits above the mobile tab
 * bar and in the bottom-right gutter from `md` up, so neither the screen header nor
 * the health card has to carry a log button.
 */
export default function QuickActionsFab({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);

  // Escape closes the fan — it behaves like a lightweight menu, not a dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30"
          style={{ background: 'rgba(6,34,77,0.35)' }}
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="fixed bottom-[86px] right-5 z-40 flex flex-col items-end gap-2.5 md:bottom-6 md:right-6">
        {open
          ? actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className="flex animate-fade-slide-up items-center gap-2 rounded-full py-2.5 pl-3.5 pr-4 text-[13.5px] font-bold transition-transform active:scale-[0.96]"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ))
          : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close log menu' : 'Log something'}
          className="flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: 'var(--accent)', boxShadow: '0 6px 18px rgba(52,210,193,0.35)' }}
        >
          {open ? (
            <X size={24} color="#06224D" strokeWidth={2.6} />
          ) : (
            <Plus size={26} color="#06224D" strokeWidth={2.6} />
          )}
        </button>
      </div>
    </>
  );
}
