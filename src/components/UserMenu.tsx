import { Link } from 'react-router-dom';

import { Avatar } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

/**
 * The avatar at phone width, where the sidebar is hidden: it opens Profile, which holds
 * the theme, log out and the account.
 */
export default function UserMenu({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const profileName = useAppStore((s) => s.profile.display_name);
  const name = profileName?.trim() || user?.email || 'F';

  return (
    <Link to="/profile" aria-label="Profile and settings" className={`rounded-full transition-transform active:scale-[0.94] ${className}`}>
      <Avatar initial={(name[0] ?? 'F').toUpperCase()} />
    </Link>
  );
}
