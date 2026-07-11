import { LogOut, Moon, Sun, UserCog } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Avatar } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { useAppStore } from '@/store/useAppStore';

function deriveDisplay(email: string | null | undefined, storedName: string): { name: string; email: string } {
  const name = storedName?.trim() || (email ? (email.split('@')[0] ?? 'Athlete') : 'Athlete');
  return { name: name.charAt(0).toUpperCase() + name.slice(1), email: email ?? '' };
}

/**
 * Avatar button that opens an account menu (edit profile, theme toggle, sign
 * out). The desktop sidebar / rail already surface these; this is primarily the
 * account entry point on mobile, where the side chrome is hidden.
 */
export default function UserMenu({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme } = useAppTheme();
  const profileName = useAppStore((s) => s.profile.display_name);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { name, email } = deriveDisplay(user?.email, profileName);
  const initial = (name[0] ?? 'F').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    try {
      await signOut();
      navigate('/login');
    } catch {
      // no-op — provider surfaces errors elsewhere
    }
  };

  const itemClass =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-colors hover:bg-[var(--bg-subtle)]';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="rounded-full transition-transform active:scale-[0.94]"
      >
        <Avatar initial={initial} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[236px] rounded-2xl p-2 shadow-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar initial={initial} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {name}
              </div>
              <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                {email}
              </div>
            </div>
          </div>
          <div className="mx-1 my-1 h-px" style={{ background: 'var(--border-base)' }} />

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
          >
            <UserCog size={17} color="var(--tab-inactive)" strokeWidth={2} />
            Edit profile
          </button>

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            style={{ color: 'var(--text-primary)' }}
            onClick={toggleTheme}
          >
            {isDark ? <Sun size={17} color="var(--tab-inactive)" /> : <Moon size={17} color="var(--tab-inactive)" />}
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            style={{ color: 'var(--forma-danger)' }}
            onClick={() => void handleSignOut()}
          >
            <LogOut size={17} color="var(--forma-danger)" strokeWidth={2} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
