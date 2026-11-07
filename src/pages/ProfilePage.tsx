import { ChevronDown, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import CoachMemory from '@/components/CoachMemory';
import DeleteAccountDialog from '@/components/DeleteAccountDialog';
import { WorkoutPrefsCard } from '@/components/LogbookView';
import { Segmented } from '@/components/ui';
import {
  updateProfile,
  type BiologicalSex,
  type CoachPersonality,
  type FitnessLevel,
  type PrimaryGoal,
  type ProfilePayload,
} from '@/lib/api';
import {
  addToList,
  GOAL_LABELS,
  profileSections,
  VOICE_OPTIONS,
  type ProfileSection,
  type ProfileSectionKey,
} from '@/lib/profileView';
import { cmToIn, formatNumber, inToCm, type UnitSystem } from '@/lib/units';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme, type ThemePreference } from '@/providers/ThemeProvider';
import { useAppStore, type UserProfile } from '@/store/useAppStore';

const GOAL_OPTIONS = Object.entries(GOAL_LABELS).map(([value, label]) => ({ value: value as PrimaryGoal, label }));
const FITNESS_LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];
const FEAR_OPTIONS = ['Injury', 'Judgement', 'Burnout', 'Staying consistent', 'Not knowing what to do'];
const DURATION_PRESETS = [10, 20, 30, 45, 60];
const LOOKS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

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
  limitations: string[];
  equipment: string[];
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
    limitations: p.limitations ?? [],
    equipment: p.equipment_available ?? [],
    birthYear: p.birth_year != null ? String(p.birth_year) : '',
    heightCm: height.cm,
    heightFt: height.ft,
    heightIn: height.inches,
    sex: p.sex ?? null,
    maxHr: p.max_heart_rate != null ? String(p.max_heart_rate) : '',
  };
}

/** The fields one section's Save sends: each section saves on its own. */
function sectionPayload(
  section: ProfileSectionKey,
  form: FormState,
  profile: UserProfile,
  system: UnitSystem,
): { ok: true; payload: ProfilePayload } | { ok: false; error: string } {
  switch (section) {
    case 'about':
      return { ok: true, payload: { display_name: form.displayName.trim(), primary_goal: form.goal, coach_personality: form.personality } };
    case 'training':
      if (form.days.length === 0) return { ok: false, error: 'Pick at least one training day.' };
      return {
        ok: true,
        payload: { available_days: orderDays(form.days), fitness_level: form.fitnessLevel, preferred_duration_minutes: form.duration },
      };
    case 'plan':
      return { ok: true, payload: { limitations: form.limitations, equipment_available: form.equipment, fears: form.fears } };
    case 'body': {
      const body = parseBodyFields(form, system);
      if (!body.ok) return body;
      // An untouched imperial height round-trips through whole inches; keep the stored value.
      const seeded = formFromProfile(profile);
      const heightUntouched = form.heightCm === seeded.heightCm && form.heightFt === seeded.heightFt && form.heightIn === seeded.heightIn;
      return {
        ok: true,
        payload: {
          birth_year: body.birth_year,
          height_cm: heightUntouched ? (profile.height_cm ?? null) : body.height_cm,
          sex: form.sex,
          max_heart_rate: body.max_heart_rate,
        },
      };
    }
  }
}

const card = 'rounded-[20px] bg-[var(--surface)]';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, user, signOut, deleteAccount } = useAuth();
  const { preference, setPreference } = useAppTheme();
  const profile = useAppStore((s) => s.profile);
  const [editing, setEditing] = useState<ProfileSectionKey | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const name = profile.display_name?.trim() || user?.email?.split('@')[0] || 'You';
  const sections = profileSections(profile);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
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

  const sectionCard = (section: ProfileSection) =>
    editing === section.key ? (
      <SectionEditor key={section.key} section={section} onDone={() => setEditing(null)} />
    ) : (
      <ReadSection key={section.key} section={section} onEdit={() => setEditing(section.key)} />
    );

  return (
    <div className="mx-auto flex w-full max-w-[1040px] animate-fade-slide-up flex-col gap-6 px-4 pb-16 pt-6 sm:px-10 sm:pt-10">
      <header className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="flex h-16 w-16 flex-none items-center justify-center rounded-full text-[26px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <h1 className="type-screen-title m-0 truncate" style={{ color: 'var(--ink)' }}>{name}</h1>
          <span className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {user?.email ? `${user.email} · ` : ''}This is what your coach knows about you.
          </span>
        </div>
      </header>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))' }}>
        <div className="flex min-w-0 flex-col gap-5">{sections.map(sectionCard)}</div>

        <div className="flex min-w-0 flex-col gap-5">
          <CoachMemory accessToken={session?.access_token} />

          <section aria-label="During a workout" className={`${card} flex flex-col gap-4 p-5`}>
            <h2 className="m-0 text-[17px] font-bold" style={{ color: 'var(--ink)' }}>During a workout</h2>
            <WorkoutPrefsCard accessToken={session?.access_token} />
          </section>

          <section aria-label="Appearance and account" className={`${card} flex flex-col gap-3 px-5 pb-2 pt-[18px]`}>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h2 className="m-0 text-[17px] font-bold" style={{ color: 'var(--ink)' }}>Appearance</h2>
              <Segmented options={LOOKS} value={preference} onChange={setPreference} size="sm" />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 py-1.5" style={{ borderTop: '1px solid var(--line)' }}>
              <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="min-h-[44px] text-[14.5px] font-bold" style={{ color: 'var(--ink)' }}>
                {signingOut ? 'Logging out…' : 'Log out'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                className="min-h-[44px] text-[14.5px] font-bold"
                style={{ color: 'var(--danger)' }}
              >
                Delete account
              </button>
            </div>
          </section>
        </div>
      </div>

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

function ReadSection({ section, onEdit }: { section: ProfileSection; onEdit: () => void }) {
  return (
    <section aria-label={section.title} className={`${card} flex flex-col px-5 pb-1.5 pt-[18px]`}>
      <div className="mb-1 flex min-h-8 items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold" style={{ color: 'var(--ink)' }}>{section.title}</h2>
        <button type="button" onClick={onEdit} aria-label={`Edit ${section.title}`} className="min-h-[40px] px-1 text-[14.5px] font-bold" style={{ color: 'var(--teal)' }}>
          Edit
        </button>
      </div>
      {section.rows.length ? (
        <dl className="m-0 flex flex-col">
          {section.rows.map((row) => (
            <div key={row.label} className="grid gap-3 py-3" style={{ gridTemplateColumns: 'minmax(96px, 160px) minmax(0, 1fr)', borderTop: '1px solid var(--line)' }}>
              <dt className="text-[14px]" style={{ color: 'var(--ink-3)' }}>{row.label}</dt>
              <dd className="m-0 flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>{row.value}</span>
                {row.sub ? <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{row.sub}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {section.invite ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3.5" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
            <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{section.invite.title}</span>
            <span className="text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>{section.invite.body}</span>
          </div>
          <button type="button" onClick={onEdit} className="min-h-[44px] rounded-full px-4 text-[14px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
            {section.invite.action}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** One section turned into its form, in place, with Cancel and Save. */
function SectionEditor({ section, onDone }: { section: ProfileSection; onDone: () => void }) {
  const { session, applyProfileUpdate } = useAuth();
  const profile = useAppStore((s) => s.profile);
  const system = profile.preferred_unit_system;
  const [form, setForm] = useState<FormState>(() => formFromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxHrOpen, setMaxHrOpen] = useState(() => profile.max_heart_rate != null);
  const [limitDraft, setLimitDraft] = useState('');
  const [kitDraft, setKitDraft] = useState('');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: 'days' | 'fears', value: string) =>
    update(key, form[key].includes(value) ? form[key].filter((x) => x !== value) : [...form[key], value]);

  const handleSave = async () => {
    if (!session?.access_token) {
      setError('Your session is missing. Sign in again and retry.');
      return;
    }
    // Text still in an Add box counts: people expect Save to keep what they typed.
    const withDrafts = { ...form, limitations: addToList(form.limitations, limitDraft), equipment: addToList(form.equipment, kitDraft) };
    const built = sectionPayload(section.key, withDrafts, profile, system);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { profile: updated } = await updateProfile(session.access_token, built.payload);
      applyProfileUpdate(updated);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your profile.');
      setSaving(false);
    }
  };

  const durationOptions = Array.from(new Set([...DURATION_PRESETS, form.duration])).sort((a, b) => a - b);
  const input = 'h-12 w-full rounded-xl px-3.5 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]';
  const inputStyle = { background: 'var(--ground)', color: 'var(--ink)' };
  const big = `${input} font-number text-[24px]`;

  return (
    <section aria-label={`${section.title}, editing`} className={`${card} flex flex-col gap-[18px] px-5 pb-5 pt-[18px]`} style={{ outline: '2px solid var(--aqua)' }}>
      <div className="flex min-h-8 items-center justify-between">
        <h2 className="m-0 text-[17px] font-bold" style={{ color: 'var(--ink)' }}>{section.title}</h2>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>Editing</span>
      </div>

      {section.key === 'about' ? (
        <>
          <Field label="What should your coach call you?" htmlFor="pe-name">
            <input id="pe-name" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} maxLength={40} placeholder="Your first name" className={input} style={inputStyle} />
          </Field>
          <Field label="Main goal">
            <div role="group" aria-label="Main goal" className="grid grid-cols-2 gap-1.5">
              {GOAL_OPTIONS.map((g) => (
                <Pick key={g.value} on={form.goal === g.value} onClick={() => update('goal', g.value)}>{g.label}</Pick>
              ))}
            </div>
          </Field>
          <Field label="Coach voice">
            <div role="radiogroup" aria-label="Coach voice" className="flex flex-col overflow-hidden rounded-2xl" style={{ background: 'var(--ground)' }}>
              {VOICE_OPTIONS.map((v, i) => {
                const on = form.personality === v.value;
                return (
                  <button
                    key={v.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => update('personality', v.value as CoachPersonality)}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 text-left"
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--line)' }}
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{v.label}</span>
                      <span className="text-[13px] leading-[18px]" style={{ color: 'var(--ink-2)' }}>{v.blurb}</span>
                    </span>
                    <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full" style={{ background: on ? 'var(--aqua)' : 'transparent', border: on ? undefined : '2px solid var(--line)' }} />
                  </button>
                );
              })}
            </div>
          </Field>
        </>
      ) : null}

      {section.key === 'training' ? (
        <>
          <Field label="Days you can train" hint={form.days.length === 0 ? 'Pick at least one day.' : `${form.days.length} ${form.days.length === 1 ? 'day' : 'days'} a week.`}>
            <div role="group" aria-label="Days you can train" className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => (
                <Pick key={d.key} on={form.days.includes(d.key)} onClick={() => toggle('days', d.key)} toggle>{d.label}</Pick>
              ))}
            </div>
          </Field>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Field label="Level">
              <Segmented size="sm" options={FITNESS_LEVELS.map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))} value={form.fitnessLevel} onChange={(v) => update('fitnessLevel', v)} />
            </Field>
            <Field label="Session length, min">
              <Segmented size="sm" options={durationOptions.map((d) => ({ value: String(d), label: String(d) }))} value={String(form.duration)} onChange={(v) => update('duration', Number(v))} />
            </Field>
          </div>
        </>
      ) : null}

      {section.key === 'plan' ? (
        <>
          <TagList
            title="Injuries or limitations"
            body="Your coach works around these."
            id="pe-lim"
            items={form.limitations}
            draft={limitDraft}
            placeholder="e.g. bad knees"
            onDraft={setLimitDraft}
            onAdd={() => {
              update('limitations', addToList(form.limitations, limitDraft));
              setLimitDraft('');
            }}
            onRemove={(item) => update('limitations', form.limitations.filter((x) => x !== item))}
          />
          <TagList
            title="Equipment you have"
            body="Your coach plans with what you list."
            id="pe-kit"
            items={form.equipment}
            draft={kitDraft}
            placeholder="e.g. resistance bands"
            onDraft={setKitDraft}
            onAdd={() => {
              update('equipment', addToList(form.equipment, kitDraft));
              setKitDraft('');
            }}
            onRemove={(item) => update('equipment', form.equipment.filter((x) => x !== item))}
          />
          <Field label="What usually throws you off?">
            <div role="group" aria-label="What usually throws you off" className="flex flex-wrap gap-2">
              {FEAR_OPTIONS.map((f) => (
                <Pick key={f} on={form.fears.includes(f)} onClick={() => toggle('fears', f)} toggle pill>{f}</Pick>
              ))}
            </div>
          </Field>
        </>
      ) : null}

      {section.key === 'body' ? (
        <>
          <p className="m-0 -mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>All optional. Leave anything blank.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Birth year" htmlFor="pe-year">
              <input id="pe-year" inputMode="numeric" maxLength={4} value={form.birthYear} onChange={(e) => update('birthYear', e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 1990" className={big} style={inputStyle} />
            </Field>
            {system === 'metric' ? (
              <Field label="Height, cm" htmlFor="pe-height">
                <input id="pe-height" inputMode="decimal" maxLength={5} value={form.heightCm} onChange={(e) => update('heightCm', e.target.value)} placeholder="e.g. 175" className={big} style={inputStyle} />
              </Field>
            ) : (
              <Field label="Height">
                <div className="flex gap-1.5">
                  <input aria-label="Height, feet" inputMode="numeric" maxLength={1} value={form.heightFt} onChange={(e) => update('heightFt', e.target.value.replace(/[^0-9]/g, ''))} placeholder="ft" className={big} style={inputStyle} />
                  <input aria-label="Height, inches" inputMode="decimal" maxLength={4} value={form.heightIn} onChange={(e) => update('heightIn', e.target.value)} placeholder="in" className={big} style={inputStyle} />
                </div>
              </Field>
            )}
          </div>
          <p className="m-0 -mt-2 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>Birth year sets your heart-rate zones. Height shows your waist-to-height ratio.</p>
          <Field label="Sex" hint="Used only for reference ranges.">
            <Segmented
              size="sm"
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'none', label: 'Prefer not to say' },
              ]}
              value={form.sex ?? 'none'}
              onChange={(v) => update('sex', v === 'none' ? null : (v as BiologicalSex))}
            />
          </Field>
          <div className="rounded-2xl" style={{ background: 'var(--ground)' }}>
            <button type="button" onClick={() => setMaxHrOpen((o) => !o)} aria-expanded={maxHrOpen} className="flex min-h-[56px] w-full items-center justify-between px-4 text-left">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Max heart rate</span>
                <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{form.maxHr ? `${form.maxHr} bpm, set by you` : 'Estimated from your age'}</span>
              </span>
              <ChevronDown size={18} aria-hidden="true" style={{ color: 'var(--ink-3)', transform: maxHrOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {maxHrOpen ? (
              <div className="flex flex-col gap-2 px-4 pb-4">
                <input aria-label="Max heart rate, beats per minute" inputMode="numeric" maxLength={3} value={form.maxHr} onChange={(e) => update('maxHr', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Leave blank to estimate" className={input} style={{ background: 'var(--surface)', color: 'var(--ink)' }} />
                <span className="text-[13px] leading-[18px]" style={{ color: 'var(--ink-2)' }}>Only set this if you&apos;ve measured it in a lab or an all-out test.</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-11 rounded-xl px-[18px] text-[14.5px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
          Cancel
        </button>
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="h-11 rounded-xl px-[22px] text-[14.5px] font-bold disabled:opacity-60" style={{ background: 'var(--ink)', color: 'var(--ground)' }}>
          {saving ? 'Saving…' : `Save ${section.title.toLowerCase()}`}
        </button>
      </div>
    </section>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>{label}</label>
      ) : (
        <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>{label}</span>
      )}
      {children}
      {hint ? <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{hint}</span> : null}
    </div>
  );
}

function Pick({ on, onClick, toggle, pill, children }: { on: boolean; onClick: () => void; toggle?: boolean; pill?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={toggle ? on : undefined}
      role={toggle ? undefined : 'radio'}
      aria-checked={toggle ? undefined : on}
      className={`${pill ? 'h-11 rounded-full px-4' : 'h-11 rounded-xl px-2'} text-[14px] font-bold`}
      style={{ background: on ? 'var(--ink)' : 'var(--ground)', color: on ? 'var(--ground)' : 'var(--ink)' }}
    >
      {children}
    </button>
  );
}

function TagList({
  title,
  body,
  id,
  items,
  draft,
  placeholder,
  onDraft,
  onAdd,
  onRemove,
}: {
  title: string;
  body: string;
  id: string;
  items: string[];
  draft: string;
  placeholder: string;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (item: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
        <span className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>{body}</span>
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="flex h-10 items-center rounded-full pl-3.5 text-[14px] font-semibold" style={{ background: 'var(--ground)', color: 'var(--ink)' }}>
              {item}
              <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item}`} className="flex h-10 w-9 items-center justify-center" style={{ color: 'var(--ink-3)' }}>
                <X size={15} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <label htmlFor={id} className="sr-only">Add to {title.toLowerCase()}</label>
        <input id={id} value={draft} onChange={(e) => onDraft(e.target.value)} placeholder={placeholder} className="h-12 min-w-0 flex-1 rounded-xl px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]" style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
        <button type="submit" disabled={!draft.trim()} className="h-12 rounded-xl px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
          Add
        </button>
      </form>
    </div>
  );
}
