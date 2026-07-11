import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ScreenHeader from '@/components/ScreenHeader';
import { Button, Card, Chip, Eyebrow, Input } from '@/components/ui';
import {
  updateProfile,
  type CoachPersonality,
  type FitnessLevel,
  type PrimaryGoal,
  type ProfilePayload,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore, type UserProfile } from '@/store/useAppStore';

/** Full goal enum (the onboarding step only surfaces the four most common). */
const GOAL_OPTIONS: { value: PrimaryGoal; label: string }[] = [
  { value: 'weight_loss', label: 'Lose weight' },
  { value: 'muscle_gain', label: 'Build strength' },
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'endurance', label: 'Improve endurance' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'stress_relief', label: 'Reduce stress' },
];

const PERSONALITY_OPTIONS: { value: CoachPersonality; label: string; blurb: string }[] = [
  { value: 'zen', label: 'Zen', blurb: 'Calm and grounding when your nervous system is already loud.' },
  { value: 'cheerleader', label: 'Cheerleader', blurb: 'High-energy and quick to turn small wins into momentum.' },
  { value: 'analyst', label: 'Analyst', blurb: 'Structured, data-aware, and direct about tradeoffs.' },
];

const FITNESS_LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];
const FEAR_OPTIONS = ['Injury', 'Judgement', 'Burnout', 'Staying consistent', 'Not knowing what to do'];
const DURATION_PRESETS = [10, 20, 30, 45, 60];

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

/** Returns the selected day keys in canonical weekday order. */
function orderDays(days: string[]): string[] {
  return WEEKDAYS.filter((d) => days.includes(d.key)).map((d) => d.key);
}

/** Splits a comma/newline separated free-text list into trimmed, non-empty items. */
function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface FormState {
  displayName: string;
  goal: PrimaryGoal;
  personality: CoachPersonality;
  days: string[];
  fitnessLevel: FitnessLevel;
  fears: string[];
  duration: number;
  limitations: string;
  equipment: string;
}

function formFromProfile(p: UserProfile): FormState {
  return {
    displayName: p.display_name ?? '',
    goal: p.primary_goal ?? 'general_fitness',
    personality: p.coach_personality,
    days: p.available_days ?? [],
    fitnessLevel: p.fitness_level,
    fears: p.fears ?? [],
    duration: p.preferred_duration_minutes,
    limitations: (p.limitations ?? []).join(', '),
    equipment: (p.equipment_available ?? []).join(', '),
  };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, applyProfileUpdate } = useAuth();
  const profile = useAppStore((s) => s.profile);

  const [form, setForm] = useState<FormState>(() => formFromProfile(profile));
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed from the store until the user starts editing, so a background profile
  // hydration (stale-while-revalidate) doesn't get lost behind an untouched form.
  useEffect(() => {
    if (!dirty) setForm(formFromProfile(profile));
  }, [profile, dirty]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const toggleFear = (fear: string) =>
    update('fears', form.fears.includes(fear) ? form.fears.filter((f) => f !== fear) : [...form.fears, fear]);

  const toggleDay = (key: string) =>
    update('days', form.days.includes(key) ? form.days.filter((d) => d !== key) : [...form.days, key]);

  // Keep any custom duration the user already had alongside the presets.
  const durationOptions = Array.from(new Set([...DURATION_PRESETS, form.duration])).sort((a, b) => a - b);

  const canSave = form.days.length > 0 && !submitting;

  const handleSave = async () => {
    if (!session?.access_token) {
      setError('Your session is missing. Sign in again and retry.');
      return;
    }
    if (form.days.length === 0) {
      setError('Pick at least one training day.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const payload: ProfilePayload = {
      display_name: form.displayName.trim(),
      primary_goal: form.goal,
      coach_personality: form.personality,
      fitness_level: form.fitnessLevel,
      preferred_duration_minutes: form.duration,
      available_days: orderDays(form.days),
      fears: form.fears,
      limitations: splitList(form.limitations),
      equipment_available: splitList(form.equipment),
    };
    try {
      const { profile: updated } = await updateProfile(session.access_token, payload);
      applyProfileUpdate(updated);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] animate-fade-slide-up flex-col gap-6 p-6 sm:p-10">
      <ScreenHeader
        title="Edit profile"
        subtitle="Update how Forma plans and coaches you. Changes apply to your next plan and chats."
        rightActions={
          <Button variant="secondary" size="sm" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/')}>
            Home
          </Button>
        }
      />

      {/* About you */}
      <Card padding="24px">
        <Eyebrow className="mb-4">About you</Eyebrow>
        <Input
          label="What should your coach call you?"
          placeholder="Your name"
          value={form.displayName}
          onChange={(e) => update('displayName', e.target.value)}
        />
        <div className="mt-5">
          <Eyebrow className="mb-2.5">Primary goal</Eyebrow>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {GOAL_OPTIONS.map((g) => (
              <Chip
                key={g.value}
                active={form.goal === g.value}
                onClick={() => update('goal', g.value)}
                className="justify-center !py-3.5"
              >
                {g.label}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {/* Coach voice */}
      <Card padding="24px">
        <Eyebrow className="mb-4">Coach voice</Eyebrow>
        <div className="flex flex-col gap-2.5">
          {PERSONALITY_OPTIONS.map((p) => {
            const active = form.personality === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => update('personality', p.value)}
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
      </Card>

      {/* Training rhythm */}
      <Card padding="24px">
        <Eyebrow className="mb-4">Training rhythm</Eyebrow>
        <span className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>
          Available days
        </span>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
          {WEEKDAYS.map((d) => (
            <Chip
              key={d.key}
              active={form.days.includes(d.key)}
              onClick={() => toggleDay(d.key)}
              className="justify-center !px-0 !py-3"
            >
              {d.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
          {form.days.length > 0
            ? `${form.days.length} ${form.days.length === 1 ? 'day' : 'days'} a week`
            : 'Pick at least one day.'}
        </p>

        <div className="mt-6">
          <Eyebrow className="mb-2.5">Experience level</Eyebrow>
          <div className="flex gap-2.5">
            {FITNESS_LEVELS.map((lvl) => (
              <Chip
                key={lvl}
                active={form.fitnessLevel === lvl}
                onClick={() => update('fitnessLevel', lvl)}
                className="flex-1 justify-center capitalize !py-3.5"
              >
                {lvl}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <Eyebrow className="mb-2.5">Session length</Eyebrow>
          <div className="flex flex-wrap gap-2.5">
            {durationOptions.map((m) => (
              <Chip
                key={m}
                active={form.duration === m}
                onClick={() => update('duration', m)}
                className="flex-1 justify-center !py-3"
              >
                {m}m
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {/* Personalization */}
      <Card padding="24px">
        <Eyebrow className="mb-4">Personalization</Eyebrow>
        <span className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>
          What usually throws you off?
        </span>
        <div className="flex flex-wrap gap-2.5">
          {FEAR_OPTIONS.map((f) => (
            <Chip key={f} active={form.fears.includes(f)} onClick={() => toggleFear(f)}>
              {f}
            </Chip>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <Input
            label="Injuries or limitations (comma-separated)"
            placeholder="e.g. lower back pain, bad knees"
            value={form.limitations}
            onChange={(e) => update('limitations', e.target.value)}
          />
          <Input
            label="Equipment available (comma-separated)"
            placeholder="e.g. dumbbells, resistance bands, yoga mat"
            value={form.equipment}
            onChange={(e) => update('equipment', e.target.value)}
          />
        </div>
      </Card>

      {error ? (
        <div className="text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {saved && !dirty ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--accent-text)' }}>
            <Check size={16} color="var(--accent-text)" strokeWidth={3} />
            Saved
          </span>
        ) : null}
        <Button size="lg" onClick={handleSave} disabled={!canSave}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
