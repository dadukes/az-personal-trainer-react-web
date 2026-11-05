import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { updateProfile, type CoachPersonality, type FitnessLevel, type PrimaryGoal } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
  1: 'How should your coach talk to you?',
  2: 'What are you training for?',
  3: 'When can you train?',
};

const FITNESS_OPTIONS: { value: FitnessLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'I need a low-friction starting point.' },
  { value: 'intermediate', label: 'Intermediate', hint: 'I have some rhythm and want coaching that adapts.' },
  { value: 'advanced', label: 'Advanced', hint: 'Push me, but keep it intelligent.' },
];

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

/**
 * Three short steps after sign-up (board `Onboarding`): the coach's voice, the goal, then
 * the week. Follows the theme. Mobile twin: `app/(auth)/onboarding.tsx`.
 */
export default function OnboardingPage() {
  const { session, markOnboardingComplete } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState('');
  const [goal, setGoal] = useState<PrimaryGoal>('weight_loss');
  const [personality, setPersonality] = useState<CoachPersonality>('zen');
  const [selectedDays, setSelectedDays] = useState<string[]>(DEFAULT_DAYS);
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('beginner');
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
      setError(err instanceof Error ? err.message : 'Couldn’t save your answers. Please try again.');
      setSubmitting(false);
    }
  };

  const stepReady = step === 3 ? selectedDays.length > 0 : true;

  return (
    <div className="flex min-h-[100dvh] justify-center" style={{ background: 'var(--ground)' }}>
      <div className="flex w-full max-w-[560px] flex-col gap-5 px-5 pb-5 pt-6 sm:pt-12">
        <div role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3} aria-label={`Step ${step} of 3`} className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((n) => (
            <span key={n} className="h-1 rounded-sm" style={{ background: n <= step ? 'var(--ink)' : 'var(--line)' }} />
          ))}
        </div>

        <h1 className="type-display m-0 mt-2 text-[44px] leading-[1.05]" style={{ color: 'var(--ink)' }}>
          {STEP_TITLES[step]}
        </h1>

        {step === 1 ? (
          <>
            <Field label="What should we call you?">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your first name"
                autoComplete="given-name"
                maxLength={40}
                aria-label="What should we call you?"
                className="h-[54px] w-full rounded-[14px] border-0 px-4 text-[16px] outline-none placeholder:text-[var(--ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
                style={{ background: 'var(--surface)', color: 'var(--ink)' }}
              />
            </Field>
            <div role="radiogroup" aria-label="Coach style" className="flex flex-col gap-2">
              {PERSONALITY_OPTIONS.map((o) => (
                <RadioCard key={o.value} label={o.label} blurb={o.blurb} selected={personality === o.value} onSelect={() => setPersonality(o.value)} />
              ))}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Field label="Main goal">
              <ChipGroup
                options={GOAL_OPTIONS.map((g) => ({ key: g.value, label: g.label }))}
                selected={[goal]}
                onToggle={(key) => setGoal(key as PrimaryGoal)}
                single
              />
            </Field>
            <Field label="Where are you starting from?">
              <div role="radiogroup" className="flex flex-col gap-2">
                {FITNESS_OPTIONS.map((o) => (
                  <RadioCard key={o.value} label={o.label} blurb={o.hint} selected={fitnessLevel === o.value} onSelect={() => setFitnessLevel(o.value)} />
                ))}
              </div>
            </Field>
            <Field label="How long can a workout be?">
              <ChipGroup
                options={DURATION_OPTIONS.map((m) => ({ key: String(m), label: `${m} min` }))}
                selected={[String(duration)]}
                onToggle={(key) => setDuration(Number(key))}
                single
              />
            </Field>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field label="Days that realistically work" hint={`${orderedDays.length} ${orderedDays.length === 1 ? 'day' : 'days'} a week`}>
              <ChipGroup options={WEEKDAYS} selected={selectedDays} onToggle={toggleDay} />
            </Field>
            <Field label="What usually gets in the way?" hint="Pick any. Your coach plans around them.">
              <ChipGroup options={FEAR_OPTIONS.map((f) => ({ key: f, label: f }))} selected={fears} onToggle={toggleFear} />
            </Field>
          </>
        ) : null}

        <div className="min-h-3 flex-1" />

        {error ? (
          <p role="alert" className="m-0 text-[14px] leading-5" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : null}

        <div className="flex gap-2.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStep((step - 1) as Step);
                setError(null);
              }}
              disabled={submitting}
              className="h-[60px] rounded-button px-[22px] text-[17px] font-bold"
              style={{ background: 'var(--sunken)', color: 'var(--ink)' }}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (step < 3 ? setStep((step + 1) as Step) : void handleFinish())}
            disabled={!stepReady || submitting}
            className="h-[60px] flex-1 rounded-button text-[17px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}
          >
            {submitting ? 'Saving…' : step < 3 ? 'Continue' : 'Meet your coach'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }}>
          {label}
        </span>
        {hint ? (
          <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function RadioCard({ label, blurb, selected, onSelect }: { label: string; blurb: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex items-start gap-3 rounded-[18px] px-4 py-3.5 text-left"
      style={{ background: selected ? 'var(--tint)' : 'var(--surface)', border: `2px solid ${selected ? 'var(--teal)' : 'transparent'}` }}
    >
      <span className="flex flex-1 flex-col gap-[3px]">
        <span className="text-[16px] font-bold" style={{ color: 'var(--ink)' }}>
          {label}
        </span>
        <span className="text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
          {blurb}
        </span>
      </span>
      <span
        aria-hidden
        className="mt-px h-6 w-6 flex-none rounded-full"
        style={{ border: selected ? '7px solid var(--teal)' : '2px solid var(--ink-3)', background: 'var(--surface)' }}
      />
    </button>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
  single = false,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  single?: boolean;
}) {
  return (
    <div role={single ? 'radiogroup' : 'group'} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            role={single ? 'radio' : 'checkbox'}
            aria-checked={on}
            onClick={() => onToggle(o.key)}
            className="min-h-11 rounded-full px-4 text-[14px] font-semibold"
            style={{ background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--ground)' : 'var(--ink)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
