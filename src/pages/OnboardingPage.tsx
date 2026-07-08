import { Check, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Chip, Eyebrow, Input } from '@/components/ui';
import { updateProfile, type CoachPersonality, type FitnessLevel, type PrimaryGoal } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

type Step = 1 | 2 | 3;

const GOAL_OPTIONS: { value: PrimaryGoal; label: string }[] = [
  { value: 'weight_loss', label: 'Lose weight' },
  { value: 'muscle_gain', label: 'Build strength' },
  { value: 'endurance', label: 'Improve endurance' },
  { value: 'stress_relief', label: 'Reduce stress' },
];

const PERSONALITY_OPTIONS: { value: CoachPersonality; label: string; blurb: string }[] = [
  { value: 'zen', label: 'Zen', blurb: 'Calm and grounding when your nervous system is already loud.' },
  { value: 'cheerleader', label: 'Cheerleader', blurb: 'High-energy and quick to turn small wins into momentum.' },
  { value: 'analyst', label: 'Analyst', blurb: 'Structured, data-aware, and direct about tradeoffs.' },
];

const FEAR_OPTIONS = ['Injury', 'Judgement', 'Burnout', 'Staying consistent', 'Not knowing what to do'];
const DURATION_OPTIONS = [10, 20, 30, 45];

/** Weekday keys in the backend's expected order; `label` is the picker chip text. */
const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];
const DEFAULT_DAYS = ['monday', 'wednesday', 'friday'];

/** Returns the selected day keys in canonical weekday order. */
function orderDays(days: string[]): string[] {
  return WEEKDAYS.filter((d) => days.includes(d.key)).map((d) => d.key);
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="mb-7 flex items-center gap-2">
      {[1, 2, 3].map((n, idx) => {
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-extrabold"
              style={
                done || active
                  ? { background: 'var(--forma-aqua)', color: 'var(--forma-navy)' }
                  : { border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }
              }
            >
              {done ? <Check size={16} color="var(--forma-navy)" strokeWidth={3} /> : n}
            </div>
            {idx < 2 ? (
              <div className="h-0.5 w-11" style={{ background: n < step ? 'var(--forma-aqua)' : 'var(--border-base)' }} />
            ) : null}
          </div>
        );
      })}
      <span className="ml-2.5 text-[12.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
        Step {step} of 3
      </span>
    </div>
  );
}

export default function OnboardingPage() {
  const { session, markOnboardingComplete } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState('');
  const [goal, setGoal] = useState<PrimaryGoal>('weight_loss');
  const [personality, setPersonality] = useState<CoachPersonality>('zen');
  const [selectedDays, setSelectedDays] = useState<string[]>(DEFAULT_DAYS);
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate');
  const [fears, setFears] = useState<string[]>(['Burnout']);
  const [duration, setDuration] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFear = (fear: string) =>
    setFears((cur) => (cur.includes(fear) ? cur.filter((f) => f !== fear) : [...cur, fear]));

  const toggleDay = (key: string) =>
    setSelectedDays((cur) => (cur.includes(key) ? cur.filter((d) => d !== key) : [...cur, key]));

  const orderedDays = orderDays(selectedDays);

  const handleFinish = async () => {
    if (!session?.access_token) {
      setError('Your session is missing. Sign in again and retry onboarding.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile(session.access_token, {
        coach_personality: personality,
        fitness_level: fitnessLevel,
        primary_goal: goal,
        preferred_duration_minutes: duration,
        fears,
        available_days: orderedDays,
        display_name: displayName.trim() || undefined,
      });
      await markOnboardingComplete();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your vibe check.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-5 sm:p-10" style={{ background: 'var(--bg-app)' }}>
      <div className="w-full max-w-[600px] animate-fade-slide-up">
        <StepDots step={step} />

        {/* Step 1 — goal + name + voice */}
        {step === 1 ? (
          <Card padding="32px">
            <div className="text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              What&rsquo;s your goal?
            </div>
            <p className="mb-5 mt-2 text-[14px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              Pick what matters most right now — we&rsquo;ll tune your plan around it.
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {GOAL_OPTIONS.map((g) => (
                <Chip
                  key={g.value}
                  active={goal === g.value}
                  onClick={() => setGoal(g.value)}
                  className="justify-center !py-3.5"
                >
                  {g.label}
                </Chip>
              ))}
            </div>

            <div className="mt-6">
              <Input
                label="What should your coach call you?"
                placeholder="Optional — makes things feel less robotic"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="mt-6">
              <Eyebrow className="mb-2.5">Coach voice</Eyebrow>
              <div className="flex flex-col gap-2.5">
                {PERSONALITY_OPTIONS.map((p) => {
                  const active = personality === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPersonality(p.value)}
                      className="rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
                      style={{
                        background: active ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-base)'}`,
                      }}
                    >
                      <div
                        className="text-[15px] font-bold"
                        style={{ color: active ? 'var(--text-on-mint)' : 'var(--text-primary)' }}
                      >
                        {p.label}
                      </div>
                      <div
                        className="mt-1 text-[13px] leading-[1.4]"
                        style={{ color: active ? '#0E4C45cc' : 'var(--text-muted)' }}
                      >
                        {p.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-7 flex justify-end">
              <Button size="lg" onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Step 2 — rhythm + level + fears + duration */}
        {step === 2 ? (
          <Card padding="32px">
            <div className="text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Your training rhythm
            </div>
            <p className="mb-5 mt-2 text-[14px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              Which days can you realistically commit to? Tap the days that work for you.
            </p>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.key}
                  active={selectedDays.includes(d.key)}
                  onClick={() => toggleDay(d.key)}
                  className="justify-center !px-0 !py-3"
                >
                  {d.label}
                </Chip>
              ))}
            </div>
            <p className="mt-2.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              {selectedDays.length > 0
                ? `${selectedDays.length} ${selectedDays.length === 1 ? 'day' : 'days'} a week`
                : 'Pick at least one day to continue.'}
            </p>

            <div className="mt-6">
              <Eyebrow className="mb-2.5">Experience level</Eyebrow>
              <div className="flex gap-2.5">
                {(['beginner', 'intermediate', 'advanced'] as FitnessLevel[]).map((lvl) => (
                  <Chip
                    key={lvl}
                    active={fitnessLevel === lvl}
                    onClick={() => setFitnessLevel(lvl)}
                    className="flex-1 justify-center capitalize !py-3.5"
                  >
                    {lvl}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <Eyebrow className="mb-2.5">What usually throws you off?</Eyebrow>
              <div className="flex flex-wrap gap-2.5">
                {FEAR_OPTIONS.map((f) => (
                  <Chip key={f} active={fears.includes(f)} onClick={() => toggleFear(f)}>
                    {f}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <Eyebrow className="mb-2.5">Session length</Eyebrow>
              <div className="flex gap-2.5">
                {DURATION_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    active={duration === m}
                    onClick={() => setDuration(m)}
                    className="flex-1 justify-center !py-3"
                  >
                    {m}m
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-7 flex justify-between">
              <Button variant="secondary" size="lg" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => setStep(3)}
                disabled={fears.length === 0 || selectedDays.length === 0}
              >
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Step 3 — connect + review */}
        {step === 3 ? (
          <Card padding="32px">
            <div className="text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Connect your data
            </div>
            <p className="mb-5 mt-2 text-[14px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              Wearable sync isn&rsquo;t available on the web yet — your plan still adapts from your daily
              pulse checks and coach chat. You can connect a device later in the mobile app.
            </p>

            <div className="flex flex-col gap-2.5">
              {['Apple Health', 'Google Fit'].map((provider) => (
                <Card key={provider} variant="subtle" padding="14px 16px">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={20} color="#34D2C1" />
                    <span className="flex-1 text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {provider}
                    </span>
                    <Button variant="secondary" size="sm" disabled>
                      Mobile only
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-6 rounded-2xl p-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}>
              <Eyebrow className="mb-3">Your vibe check</Eyebrow>
              {[
                ['Goal', GOAL_OPTIONS.find((g) => g.value === goal)?.label ?? goal],
                ['Coach voice', personality],
                [
                  'Rhythm',
                  `${selectedDays.length} days · ${orderedDays
                    .map((k) => WEEKDAYS.find((d) => d.key === k)?.label)
                    .join(', ')}`,
                ],
                ['Fitness level', fitnessLevel],
                ['Session length', `${duration} minutes`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b py-2.5 last:border-b-0"
                  style={{ borderColor: 'var(--border-base)' }}
                >
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {label}
                  </span>
                  <span className="text-[13px] font-bold capitalize" style={{ color: 'var(--text-primary)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {error ? (
              <div className="mt-4 text-[13px]" style={{ color: 'var(--forma-danger)' }}>
                {error}
              </div>
            ) : null}

            <div className="mt-7 flex justify-between">
              <Button variant="ghost" size="lg" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button size="lg" onClick={handleFinish} disabled={submitting}>
                {submitting ? 'Saving…' : 'Start my plan'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
