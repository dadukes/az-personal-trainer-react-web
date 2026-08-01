import { ArrowLeft, Check, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import DeleteAccountDialog, { DELETED_DATA } from '@/components/DeleteAccountDialog';
import { Button, Card, Eyebrow, Input } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Public account-deletion page — the URL published in the Play Console listing.
 *
 * Deliberately outside `RequireAuth`: Google Play requires a route a user can reach
 * from a browser, without installing the app, to request deletion of their account.
 * So this page carries its own sign-in step rather than bouncing through `/login`
 * (which would land the user back on Home after authenticating), and it also states
 * what is deleted and what is kept for people who arrive without signing in at all.
 */
export default function DeleteAccountPage() {
  const { isAuthenticated, user, signIn, deleteAccount } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signingIn) return;
    if (!email.trim() || password.length < 6) {
      setSignInError('Enter your email and password to continue.');
      return;
    }
    setSignInError(null);
    setSigningIn(true);
    try {
      await signIn({ email: email.trim(), password });
      setPassword('');
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign-in failed. Check your details.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      // Deletion signs the user out, which re-renders this page as unauthenticated —
      // `deleted` outranks that branch so the confirmation is what they actually see.
      setDeleted(true);
      setDialogOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete your account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] px-5 py-10" style={{ background: 'var(--bg-app)' }}>
      <div className="mx-auto flex w-full max-w-[560px] animate-fade-slide-up flex-col gap-6">
        <div className="flex items-center gap-3">
          <img src="/forma_logo.png" alt="" className="h-9 w-9" />
          <div>
            <div className="text-[19px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Forma Fitness
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Account &amp; data deletion
            </div>
          </div>
        </div>

        {deleted ? (
          <Card padding="24px">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--bg-selected)' }}
              >
                <Check size={18} color="var(--text-on-mint)" strokeWidth={3} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  Your account has been deleted
                </div>
                <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
                  Your Forma account and all of the data listed below were permanently removed. If
                  the app is still installed on a device, signing out there clears the last local
                  copy. You&rsquo;re welcome back any time — a new sign-up starts from scratch.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <Link to="/login">
                <Button variant="secondary" leftIcon={<ArrowLeft size={16} />}>
                  Back to sign in
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <Card padding="24px">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <ShieldAlert size={18} color="var(--forma-danger)" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    Delete your Forma account
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
                    Sign in below to delete your account and everything in it. Deletion happens
                    straight away — there is no waiting period, no soft delete and no backup we can
                    restore from. You can do the same from the app under{' '}
                    <strong>Edit profile → Danger zone</strong>.
                  </p>
                </div>
              </div>
            </Card>

            <Card padding="24px">
              <Eyebrow className="mb-3">What gets deleted</Eyebrow>
              <ul className="flex flex-col gap-2">
                {DELETED_DATA.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-[13.5px] leading-[1.5]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span aria-hidden style={{ color: 'var(--forma-danger)' }}>
                      &bull;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <Eyebrow className="mb-3">What is kept</Eyebrow>
                <p className="text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
                  Nothing that identifies you. The shared exercise library is reference data that was
                  never yours, and usage records tied to your account are removed with it. We keep no
                  copy of your account after deletion, and there is no retention period.
                </p>
              </div>
            </Card>

            {isAuthenticated ? (
              <Card padding="24px">
                <Eyebrow className="mb-3">Signed in</Eyebrow>
                <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                  You&rsquo;re signed in as <strong>{user?.email}</strong>. This deletes that account.
                </p>
                <div className="mt-4">
                  <Button
                    variant="danger"
                    fullWidth
                    leftIcon={<Trash2 size={16} color="#fff" />}
                    onClick={() => {
                      setDeleteError(null);
                      setDialogOpen(true);
                    }}
                  >
                    Delete my account
                  </Button>
                </div>
                {deleteError ? (
                  <div className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
                    {deleteError}
                  </div>
                ) : null}
              </Card>
            ) : (
              <Card padding="24px">
                <Eyebrow className="mb-3">Verify it&rsquo;s you</Eyebrow>
                <p className="mb-4 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                  Sign in with the account you want deleted. We only ever delete the account you sign
                  in with.
                </p>
                <form className="flex flex-col gap-4" onSubmit={(e) => void handleSignIn(e)}>
                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <Input
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                  />
                  {signInError ? (
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
                      {signInError}
                    </div>
                  ) : null}
                  <Button type="submit" fullWidth disabled={signingIn}>
                    {signingIn ? 'Signing in…' : 'Sign in to continue'}
                  </Button>
                </form>
              </Card>
            )}
          </>
        )}

        <Link
          to="/login"
          className="self-start text-[13px] font-semibold underline-offset-2 hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          Back to Forma
        </Link>
      </div>

      {dialogOpen ? (
        <DeleteAccountDialog
          email={user?.email ?? undefined}
          submitting={deleting}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
