import { ArrowLeft, Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import CoachMemory from '@/components/CoachMemory';
import DeleteAccountDialog from '@/components/DeleteAccountDialog';
import ScreenHeader from '@/components/ScreenHeader';
import { Button, Card, Chip, Eyebrow, Input } from '@/components/ui';
import {
  updateProfile,
  type BiologicalSex,
  type CoachPersonality,
  type FitnessLevel,
  type PrimaryGoal,
  type ProfilePayload,
} from '@/lib/api';
import { cmToIn, formatNumber, inToCm, type UnitSystem } from '@/lib/units';
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

const SEX_OPTIONS: { value: BiologicalSex | null; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: null, label: 'Prefer not to say' },
];

/** Backend bounds (API_docs → profile fields). */
const MIN_BIRTH_YEAR = 1900;
const HEIGHT_CM_RANGE = { min: 100, max: 250 };
const MAX_HR_RANGE = { min: 100, max: 240 };

/** Height form fields: one `cm` box in metric, `ft` + `in` boxes in imperial. */
function heightToFields(cm: number | null, system: UnitSystem): { cm: string; ft: string; inches: string } {
  if (cm == null) return { cm: '', ft: '', inches: '' };
  if (system === 'metric') return { cm: formatNumber(cm), ft: '', inches: '' };
  const totalIn = Math.round(cmToIn(cm));
  return { cm: '', ft: String(Math.floor(totalIn / 12)), inches: String(totalIn % 12) };
}

/** Parses the body-profile fields; returns either the payload values or the first error. */
function parseBodyFields(
  form: FormState,
  system: UnitSystem,
):
  | { ok: true; birth_year: number | null; height_cm: number | null; max_heart_rate: number | null }
  | { ok: false; error: string } {
  const maxYear = new Date().getFullYear() - 10;
  let birthYear: number | null = null;
  if (form.birthYear.trim()) {
    const n = Number(form.birthYear.trim());
    if (!Number.isInteger(n) || n < MIN_BIRTH_YEAR || n > maxYear) {
      return { ok: false, error: `Birth year should be between ${MIN_BIRTH_YEAR} and ${maxYear}.` };
    }
    birthYear = n;
  }

  let heightCm: number | null = null;
  if (system === 'metric' ? form.heightCm.trim() : form.heightFt.trim() || form.heightIn.trim()) {
    const cm =
      system === 'metric'
        ? Number(form.heightCm.replace(',', '.'))
        : inToCm(Number(form.heightFt || 0) * 12 + Number(form.heightIn.replace(',', '.') || 0));
    if (!Number.isFinite(cm) || cm < HEIGHT_CM_RANGE.min || cm > HEIGHT_CM_RANGE.max) {
      return {
        ok: false,
        error:
          system === 'metric'
            ? `Height should be between ${HEIGHT_CM_RANGE.min} and ${HEIGHT_CM_RANGE.max} cm.`
            : 'Height should be between 3′4″ and 8′2″.',
      };
    }
    heightCm = Math.round(cm * 10) / 10;
  }

  let maxHr: number | null = null;
  if (form.maxHr.trim()) {
    const n = Number(form.maxHr.trim());
    if (!Number.isInteger(n) || n < MAX_HR_RANGE.min || n > MAX_HR_RANGE.max) {
      return { ok: false, error: `Max heart rate should be a whole number between ${MAX_HR_RANGE.min} and ${MAX_HR_RANGE.max}.` };
    }
    maxHr = n;
  }

  return { ok: true, birth_year: birthYear, height_cm: heightCm, max_heart_rate: maxHr };
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
  birthYear: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  sex: BiologicalSex | null;
  maxHr: string;
}

function formFromProfile(p: UserProfile): FormState {
  // `?? null`: a profile cached before the body fields existed has them undefined.
  const height = heightToFields(p.height_cm ?? null, p.preferred_unit_system);
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
    birthYear: p.birth_year != null ? String(p.birth_year) : '',
    heightCm: height.cm,
    heightFt: height.ft,
    heightIn: height.inches,
    sex: p.sex ?? null,
    maxHr: p.max_heart_rate != null ? String(p.max_heart_rate) : '',
  };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, user, applyProfileUpdate, deleteAccount } = useAuth();
  const profile = useAppStore((s) => s.profile);
  const unitSystem = profile.preferred_unit_system;

  const [form, setForm] = useState<FormState>(() => formFromProfile(profile));
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(() => profile.max_heart_rate != null);

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
    const body = parseBodyFields(form, unitSystem);
    if (!body.ok) {
      setError(body.error);
      return;
    }
    // An untouched imperial height round-trips through whole inches; keep the stored
    // value rather than drifting it by a few millimetres on every save.
    const seeded = formFromProfile(profile);
    const heightUntouched =
      form.heightCm === seeded.heightCm && form.heightFt === seeded.heightFt && form.heightIn === seeded.heightIn;
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
      birth_year: body.birth_year,
      height_cm: heightUntouched ? (profile.height_cm ?? null) : body.height_cm,
      sex: form.sex,
      max_heart_rate: body.max_heart_rate,
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

  const handleDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      // The session is gone, so the guard would bounce us anyway — go there directly.
      navigate('/login', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete your account.');
      setDeleting(false);
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
          {/* Wraps like the session-length row: three nowrap chips overflow a phone-width card. */}
          <div className="flex flex-wrap gap-2.5">
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

      {/* Body & heart rate — all optional, never part of onboarding. */}
      <Card padding="24px">
        <Eyebrow className="mb-2">Body & heart rate</Eyebrow>
        <p className="mb-4 text-[13px] leading-[1.45]" style={{ color: 'var(--text-muted)' }}>
          All optional. Your birth year unlocks heart-rate zones; height lets us show waist-to-height.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Birth year"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 1990"
            value={form.birthYear}
            onChange={(e) => update('birthYear', e.target.value.replace(/[^0-9]/g, ''))}
          />
          {unitSystem === 'metric' ? (
            <Input
              label="Height (cm)"
              inputMode="decimal"
              maxLength={5}
              placeholder="e.g. 175"
              value={form.heightCm}
              onChange={(e) => update('heightCm', e.target.value)}
            />
          ) : (
            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>
                Height
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  aria-label="Height, feet"
                  inputMode="numeric"
                  maxLength={1}
                  placeholder="ft"
                  value={form.heightFt}
                  onChange={(e) => update('heightFt', e.target.value.replace(/[^0-9]/g, ''))}
                />
                <Input
                  aria-label="Height, inches"
                  inputMode="decimal"
                  maxLength={4}
                  placeholder="in"
                  value={form.heightIn}
                  onChange={(e) => update('heightIn', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-5">
          <Eyebrow className="mb-2.5">Sex</Eyebrow>
          <div className="flex flex-wrap gap-2.5">
            {SEX_OPTIONS.map((o) => (
              <Chip key={o.label} active={form.sex === o.value} onClick={() => update('sex', o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            Used only for reference ranges.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-bold"
          style={{ color: 'var(--text-secondary)' }}
        >
          {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Advanced
        </button>
        {advancedOpen ? (
          <div className="mt-3">
            <Input
              label="Max heart rate (bpm)"
              inputMode="numeric"
              maxLength={3}
              placeholder="Leave blank to estimate from age"
              value={form.maxHr}
              onChange={(e) => update('maxHr', e.target.value.replace(/[^0-9]/g, ''))}
            />
            <p className="mt-2 text-[12.5px] leading-[1.45]" style={{ color: 'var(--text-muted)' }}>
              Most people should leave this blank — we estimate it from your age. Only set it if you’ve
              measured your max in a lab or a hard, all-out test.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Coach memory — saves per-item, deliberately outside the form's Save. */}
      <CoachMemory accessToken={session?.access_token} />

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

      {/* Danger zone — deliberately last, visually separated, never a one-tap action. */}
      <Card padding="24px" style={{ borderColor: 'var(--forma-danger)' }}>
        <Eyebrow className="mb-4">Danger zone</Eyebrow>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Delete account
            </div>
            <p className="mt-1 text-[13px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
              Permanently erases your profile, coach history, workouts and health logs. Immediate
              and irreversible — we keep no backup copy.
            </p>
          </div>
          <Button
            variant="secondary"
            leftIcon={<Trash2 size={16} color="var(--forma-danger)" />}
            style={{ color: 'var(--forma-danger)', borderColor: 'var(--forma-danger)' }}
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            Delete account
          </Button>
        </div>
      </Card>

      {deleteOpen ? (
        <DeleteAccountDialog
          email={user?.email ?? undefined}
          submitting={deleting}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}
    </div>
  );
}
