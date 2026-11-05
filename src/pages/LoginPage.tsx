import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/providers/AuthProvider';

type Mode = 'sign-in' | 'sign-up';

const fieldClass =
  'h-[54px] w-full rounded-[14px] border-0 px-4 text-[16px] outline-none placeholder:text-[var(--welcome-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--aqua)]';

/**
 * Sign in or create an account (board `Welcome`): always navy, the tagline large, the form
 * below it. Mobile twin: `app/(auth)/login.tsx`.
 */
export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter a valid email and a password of at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await signIn({ email: email.trim(), password });
      } else {
        await signUp({ email: email.trim(), password });
        setNotice('Account created. If email confirmation is on, check your inbox, then sign in.');
        setMode('sign-in');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] justify-center" style={{ background: 'var(--welcome-ground)', color: 'var(--welcome-ink)' }}>
      <div className="flex w-full max-w-[440px] flex-col px-6 pb-6 pt-14 sm:justify-center sm:pt-10">
        <img src="/forma_logo.png" alt="Forma Fitness" className="h-14 w-14" />
        <h1 className="type-display m-0 mt-7 text-[64px] leading-[0.98] sm:text-[72px]">Fitness that fits you.</h1>

        <div className="min-h-8 flex-1 sm:flex-none sm:pt-10" />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold" style={{ color: 'var(--welcome-label)' }}>
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              style={{ background: 'var(--welcome-field)', color: 'var(--welcome-ink)' }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold" style={{ color: 'var(--welcome-label)' }}>
              Password
            </span>
            <input
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              style={{ background: 'var(--welcome-field)', color: 'var(--welcome-ink)' }}
            />
          </label>

          {error ? (
            <p role="alert" className="m-0 text-[14px] leading-5" style={{ color: 'var(--welcome-danger)' }}>
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="m-0 text-[14px] leading-5" style={{ color: 'var(--welcome-label)' }}>
              {notice}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1.5 h-[60px] rounded-button text-[17px] font-bold transition-transform active:scale-[0.98] disabled:opacity-70"
            style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}
          >
            {submitting ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError(null);
              setNotice(null);
            }}
            className="h-11 text-[15px] font-semibold"
          >
            {mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
          <Link
            to="/delete-account"
            className="self-center py-2 text-[13px] underline-offset-2 hover:underline"
            style={{ color: 'var(--welcome-label)' }}
          >
            Delete your account
          </Link>
        </form>
      </div>
    </div>
  );
}
