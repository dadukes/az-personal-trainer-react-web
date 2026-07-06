import { useState } from 'react';

import { Button, Input, SegmentedToggle } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

type Mode = 'sign-in' | 'sign-up';

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
        setNotice(
          'Account created. If email confirmation is enabled, check your inbox, then sign in.',
        );
        setMode('sign-in');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-app)' }}>
      {/* Hero panel */}
      <div
        className="relative hidden w-[46%] max-w-[620px] flex-col justify-center overflow-hidden p-16 lg:flex"
        style={{ background: 'var(--forma-gradient)' }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(900px 520px at 15% 0%, rgba(255,255,255,0.28), transparent 60%)' }}
        />
        <img
          src="/forma_logo.png"
          alt=""
          className="relative mb-9 h-10 w-10"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
        <div className="relative text-[12px] font-bold uppercase tracking-[0.16em] text-white/85">
          AI Personal Trainer
        </div>
        <h1 className="relative mb-3.5 mt-4 max-w-[420px] text-[38px] font-extrabold leading-[1.18] text-white">
          Train around your real life, not against it.
        </h1>
        <p className="relative max-w-[400px] text-[15.5px] leading-[1.55] text-white/90">
          Forma checks your baseline, then adapts the plan to how you actually feel.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[420px] flex-col gap-[18px] rounded-[24px] p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <div className="flex items-center gap-2.5 lg:hidden">
            <img src="/forma_logo.png" alt="" className="h-8 w-8" />
            <span className="text-[19px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Forma
            </span>
          </div>

          <div>
            <div className="text-[22px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
            </div>
            <div className="mt-1.5 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
              {mode === 'sign-in' ? 'Sign in to continue your plan.' : 'Start training that fits your life.'}
            </div>
          </div>

          <SegmentedToggle
            options={[
              { value: 'sign-in', label: 'Sign in' },
              { value: 'sign-up', label: 'Create account' },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v as Mode);
              setError(null);
              setNotice(null);
            }}
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? (
            <div
              className="rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--forma-danger)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              {error}
            </div>
          ) : null}
          {notice ? (
            <div
              className="rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium"
              style={{ background: 'var(--bg-selected)', color: 'var(--text-on-mint)' }}
            >
              {notice}
            </div>
          ) : null}

          <Button type="submit" size="lg" fullWidth disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'sign-in' ? 'Continue to coach' : 'Create account'}
          </Button>

          <p className="text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
            Secured by Supabase Auth, then the Forma coaching API for your onboarding and plans.
          </p>
        </form>
      </div>
    </div>
  );
}
