import { Home, LogOut, MessageSquare, Moon, Settings, Sun, TrendingUp, Utensils } from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { Avatar } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { useAppStore } from '@/store/useAppStore';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/coach', label: 'Coach', icon: MessageSquare },
  { to: '/fuel', label: 'Fuel', icon: Utensils },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
];

function deriveDisplay(email: string | null | undefined, storedName: string): { name: string; email: string } {
  const name = storedName?.trim() || (email ? (email.split('@')[0] ?? 'Athlete') : 'Athlete');
  return { name: name.charAt(0).toUpperCase() + name.slice(1), email: email ?? '' };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme } = useAppTheme();
  const profile = useAppStore((s) => s.profile);

  const { name, email } = deriveDisplay(user?.email, profile.display_name);
  const initial = (name[0] ?? 'F').toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      // no-op — provider surfaces errors elsewhere
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* ── Desktop sidebar (≥1024) ─────────────────────────────────────────── */}
      <aside
        className="hidden h-full w-[264px] min-w-[264px] flex-col justify-between p-4 lg:flex"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-base)' }}
      >
        <div className="flex flex-col gap-7">
          <div className="flex items-center gap-2.5 px-2 pt-2">
            <img src="/forma_logo.png" alt="" className="h-[30px] w-[30px] object-contain" />
            <span className="text-[19px] font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Forma
            </span>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline transition-colors"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--bg-selected)' : 'transparent',
                })}
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      color={isActive ? '#0E4C45' : 'var(--tab-inactive)'}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                    <span
                      className="text-[14.5px]"
                      style={{
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? 'var(--text-on-mint)' : 'var(--text-secondary)',
                      }}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="mx-1 mb-1 h-px" style={{ background: 'var(--border-base)' }} />
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar initial={initial} />
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[13.5px] font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {name}
              </div>
              <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                {email}
              </div>
            </div>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="p-1">
              {isDark ? <Sun size={17} color="var(--tab-inactive)" /> : <Moon size={17} color="var(--tab-inactive)" />}
            </button>
            <Settings size={17} color="var(--tab-inactive)" />
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <LogOut size={17} color="var(--forma-danger)" strokeWidth={2} />
            <span className="text-[13.5px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* ── Tablet icon rail (768–1023) ─────────────────────────────────────── */}
      <aside
        className="hidden h-full w-[88px] min-w-[88px] flex-col items-center justify-between py-6 md:flex lg:hidden"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-base)' }}
      >
        <div className="flex flex-col items-center gap-6">
          <img src="/forma_logo.png" alt="" className="h-[26px] w-[26px]" />
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label}>
              {({ isActive }) => (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl transition-colors"
                  style={{ background: isActive ? 'var(--bg-selected)' : 'transparent' }}
                >
                  <Icon
                    size={20}
                    color={isActive ? '#0E4C45' : 'var(--tab-inactive)'}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                </div>
              )}
            </NavLink>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <button onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun size={18} color="var(--tab-inactive)" /> : <Moon size={18} color="var(--tab-inactive)" />}
          </button>
          <button onClick={handleSignOut} aria-label="Sign out">
            <LogOut size={18} color="var(--forma-danger)" />
          </button>
          <Avatar initial={initial} />
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto pb-[74px] md:pb-0">
        {children}
      </main>

      {/* ── Mobile bottom tab bar (<768) ────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-[74px] items-center justify-around px-2 pb-3 pt-1.5 md:hidden"
        style={{ background: 'var(--tab-bg)', borderTop: '1px solid var(--tab-border)' }}
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex flex-col items-center gap-0.5">
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  color={isActive ? 'var(--tab-active)' : 'var(--tab-inactive)'}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span
                  className="text-[10px] font-bold"
                  style={{ color: isActive ? 'var(--tab-active)' : 'var(--tab-inactive)' }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
