/**
 * What Profile shows while reading: each section's rows, or an invite when it has
 * nothing yet. Pure, so it runs in plain Node. Kept identical to the mobile app's
 * `lib/profile-view.ts`.
 */
import { formatHeight, type UnitSystem } from './units';

export type ProfileSectionKey = 'about' | 'training' | 'plan' | 'body';

export interface ProfileFacts {
  display_name: string | null;
  primary_goal: string | null;
  coach_personality: string;
  available_days: string[] | null;
  fitness_level: string;
  preferred_duration_minutes: number;
  limitations: string[] | null;
  equipment_available: string[] | null;
  fears: string[] | null;
  birth_year: number | null;
  height_cm: number | null;
  sex: string | null;
  max_heart_rate: number | null;
  preferred_unit_system: UnitSystem;
}

export interface ProfileRow {
  label: string;
  value: string;
  /** A quieter line under the value, e.g. the coach voice's blurb. */
  sub?: string;
}

export interface ProfileSection {
  key: ProfileSectionKey;
  title: string;
  rows: ProfileRow[];
  /** Shown when the section is missing the parts that matter, in place of empty rows. */
  invite?: { title: string; body: string; action: string };
}

export const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Lose weight',
  muscle_gain: 'Build strength',
  general_fitness: 'General fitness',
  endurance: 'Improve endurance',
  flexibility: 'Flexibility',
  stress_relief: 'Reduce stress',
};

export const VOICE_OPTIONS = [
  { value: 'zen', label: 'Zen', blurb: 'Calm and grounding when your nervous system is already loud.' },
  { value: 'cheerleader', label: 'Cheerleader', blurb: 'High-energy and quick to turn small wins into momentum.' },
  { value: 'analyst', label: 'Analyst', blurb: 'Structured, data-aware and direct about trade-offs.' },
] as const;

export const SECTION_TITLES: Record<ProfileSectionKey, string> = {
  about: 'About you',
  training: 'Training',
  plan: 'What to plan around',
  body: 'Body and heart rate',
};

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Mon, Wed, Fri" in week order. */
export function daysText(days: readonly string[]): string {
  return WEEK.filter((d) => days.includes(d))
    .map((d) => capitalise(d.slice(0, 3)))
    .join(', ');
}

/** "Lower back pain, bad knees": a list as one line, first letter up. */
export function listText(items: readonly string[] | null | undefined): string {
  return (items ?? []).map(capitalise).join(', ');
}

/**
 * Adds typed text to a list. Commas split it into several; anything already there
 * (ignoring case) isn't added twice.
 */
export function addToList(list: readonly string[], typed: string): string[] {
  const next = [...list];
  for (const raw of typed.split(/[\n,]/)) {
    const item = raw.trim();
    if (item && !next.some((x) => x.toLowerCase() === item.toLowerCase())) next.push(item);
  }
  return next;
}

export function profileSections(p: ProfileFacts): ProfileSection[] {
  const voice = VOICE_OPTIONS.find((v) => v.value === p.coach_personality);
  const days = p.available_days ?? [];
  const about: ProfileSection = {
    key: 'about',
    title: SECTION_TITLES.about,
    rows: [
      ...(p.display_name?.trim() ? [{ label: 'Name', value: p.display_name.trim() }] : []),
      ...(p.primary_goal && GOAL_LABELS[p.primary_goal] ? [{ label: 'Goal', value: GOAL_LABELS[p.primary_goal] }] : []),
      ...(voice ? [{ label: 'Coach voice', value: voice.label, sub: voice.blurb }] : []),
    ],
  };
  const training: ProfileSection = {
    key: 'training',
    title: SECTION_TITLES.training,
    rows: [
      ...(days.length ? [{ label: 'Days', value: daysText(days), sub: `${days.length} a week` }] : []),
      { label: 'Level', value: capitalise(p.fitness_level) },
      { label: 'Session length', value: `${p.preferred_duration_minutes} min` },
    ],
  };
  const limitations = listText(p.limitations);
  const equipment = listText(p.equipment_available);
  const fears = listText(p.fears);
  const plan: ProfileSection = {
    key: 'plan',
    title: SECTION_TITLES.plan,
    rows: [
      ...(limitations ? [{ label: 'Injuries or limitations', value: limitations }] : []),
      ...(equipment ? [{ label: 'Equipment', value: equipment }] : []),
      ...(fears ? [{ label: 'What throws you off', value: fears }] : []),
    ],
    ...(!limitations && !equipment
      ? {
          invite: {
            title: 'Injuries or kit at home?',
            body: 'Tell your coach, so every plan fits your body and what you have to hand.',
            action: 'Add injuries or equipment',
          },
        }
      : {}),
  };
  const sex = p.sex === 'male' ? 'Male' : p.sex === 'female' ? 'Female' : null;
  const body: ProfileSection = {
    key: 'body',
    title: SECTION_TITLES.body,
    rows: [
      ...(p.birth_year ? [{ label: 'Birth year', value: String(p.birth_year) }] : []),
      ...(p.height_cm ? [{ label: 'Height', value: formatHeight(p.height_cm, p.preferred_unit_system) }] : []),
      ...(sex ? [{ label: 'Sex', value: sex, sub: 'Used only for reference ranges.' }] : []),
      ...(p.max_heart_rate ? [{ label: 'Max heart rate', value: `${p.max_heart_rate} bpm` }] : []),
    ],
    ...(!p.birth_year && !p.height_cm
      ? {
          invite: {
            title: 'Add your birth year and height',
            body: 'Your birth year sets your heart-rate zones. Height shows your waist-to-height ratio.',
            action: 'Add body details',
          },
        }
      : {}),
  };
  return [about, training, plan, body];
}
