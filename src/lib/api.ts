import { env } from '@/lib/env';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type CoachPersonality = 'cheerleader' | 'zen' | 'analyst';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type ActivityType = 'full_workout' | 'micro_win' | 'walk' | 'cardio' | 'class' | 'other';
export type PrimaryGoal =
  | 'weight_loss'
  | 'muscle_gain'
  | 'general_fitness'
  | 'endurance'
  | 'flexibility'
  | 'stress_relief';

export interface ProfilePayload {
  coach_personality?: CoachPersonality;
  fitness_level?: FitnessLevel;
  primary_goal?: PrimaryGoal;
  preferred_duration_minutes?: number;
  fears?: string[];
  display_name?: string;
  available_days?: string[];
  limitations?: string[];
  equipment_available?: string[];
  /** Body profile — all optional; `null` clears the stored value. */
  birth_year?: number | null;
  height_cm?: number | null;
  sex?: BiologicalSex | null;
  max_heart_rate?: number | null;
}

/** Used only for reference ranges (VO2 max norms etc.); `null` = sex-neutral. */
export type BiologicalSex = 'female' | 'male';

export interface HealthSyncPayload {
  logged_date?: string;
  sleep_hours?: number;
  sleep_quality?: number;
  stress_level?: number;
  energy_level?: number;
  resting_heart_rate?: number;
  step_count?: number;
  active_calories_burned?: number;
  notes?: string;
}

export interface ActivityLogPayload {
  activity_type: ActivityType;
  duration_minutes?: number;
  notes?: string;
  /** Cardio only — drives the proportional cardio XP tier. Must be positive when sent. */
  distance_km?: number;
}

export interface NutritionLogPayload {
  image_base64: string;
  context?: string;
}

// ─── Profile types ────────────────────────────────────────────────────────────

export interface UserProfileData {
  id: string;
  email: string;
  display_name: string | null;
  fitness_level: FitnessLevel;
  primary_goal: PrimaryGoal | null;
  fears: string[] | null;
  limitations: string[] | null;
  preferred_duration_minutes: number;
  available_days: string[] | null;
  equipment_available: string[] | null;
  coach_personality: CoachPersonality;
  preferred_unit_system: 'metric' | 'imperial';
  timezone: string;
  /** Body profile — every field is optional; `null` means "not provided". */
  birth_year: number | null;
  height_cm: number | null;
  sex: BiologicalSex | null;
  /** Override of the age-estimated max HR. Most users leave it `null`. */
  max_heart_rate: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  success: boolean;
  profile: UserProfileData;
}

// ─── Coach memory types ───────────────────────────────────────────────────────

/** `permanent` facts persist until changed; `temporary` ones fade at `expires_at`. */
export type MemoryKind = 'permanent' | 'temporary';

/** Who wrote a fact: the coach (AI) or the user, editing their own profile. */
export type MemoryOrigin = 'coach' | 'user';

/**
 * One fact from the coach's global memory — the same rows the backend pastes into
 * the system instruction on every chat turn, so editing one changes what the coach
 * believes on the next message.
 */
export interface UserMemoryItem {
  id: string;
  kind: MemoryKind;
  category: string | null;
  content: string;
  origin: MemoryOrigin;
  /** Always null for permanent facts. */
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserMemoryListResponse {
  success: boolean;
  memory: UserMemoryItem[];
}

export interface UserMemoryItemResponse {
  success: boolean;
  memory: UserMemoryItem;
}

/** Body for creating/editing a fact. `expires_at` is clamped server-side to 1–30 days. */
export interface UserMemoryPayload {
  content?: string;
  kind?: MemoryKind;
  category?: string | null;
  expires_at?: string;
}

/**
 * A stored manual health capture row from `GET /api/health/logs` (mirrors the
 * backend `health_metrics` row / `HealthSyncPayload`). This is the read-back
 * counterpart to `POST /api/health/sync`, so a capture made on any device is
 * visible everywhere (closes backend-gaps.md #7).
 */
export interface HealthLog {
  id: string;
  user_id: string;
  logged_date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  stress_level: number | null;
  energy_level: number | null;
  resting_heart_rate: number | null;
  step_count: number | null;
  active_calories_burned: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** `GET /api/health/logs?date=` — a single day's capture (or `null`). */
export interface HealthLogResponse {
  success: boolean;
  log: HealthLog | null;
}

/** `GET /api/health/logs` — recent captures, most-recent first. */
export interface HealthLogsResponse {
  success: boolean;
  logs: HealthLog[];
}

export interface ExerciseLastPerformance {
  reps?: number | null;
  weight?: number | null;
  weight_unit?: WeightUnit | null;
  performed_at?: string;
}

/**
 * The discriminator the backend stamps on **every** exercise it returns (pre-migration
 * rows get a derived one), so reads can rely on it unconditionally. Only plans cached
 * on-device before the typed-exercise rollout need the legacy heuristic fallback in
 * `lib/exercise.ts`.
 */
export type ExerciseType = 'reps' | 'timed' | 'cardio' | 'class' | 'mobility';

/** The movement behind a `cardio` exercise. Never catalog-matched (no `exercise_id`). */
export type CardioActivityKind = 'run' | 'cycle' | 'swim' | 'row' | 'walk' | 'hike' | 'other';

/** Steady-state effort vs. a structured work/recover round loop. */
export type CardioFormat = 'steady' | 'intervals';

/** The 5-zone heart-rate model (1 = very light … 5 = max). Labels are FE-owned. */
export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

/** Present on `cardio` exercises when `cardio_format === 'intervals'`. */
export interface ExerciseIntervals {
  rounds: number;
  work_seconds: number;
  recover_seconds: number;
  work_hr_zone?: HeartRateZone;
  recover_hr_zone?: HeartRateZone;
}

export interface DashboardExercise {
  name: string;
  /** Always present on server reads; optional only for on-device plans cached pre-rollout. */
  type?: ExerciseType;
  sets?: number;
  reps?: string;
  /** Structured rep range — prefer over parsing the free-text `reps`. */
  reps_min?: number;
  reps_max?: number;
  rest_seconds?: number;
  duration_seconds?: number;
  exercise_id?: string;
  target_muscle?: string;
  body_part?: string;
  cues?: string[];
  notes?: string;
  equipment?: string;
  /** Unilateral movement — show an "each side" indicator. Valid on any type. */
  is_per_side?: boolean;
  target_weight?: number;
  weight_unit?: WeightUnit;
  // ── cardio ──
  activity_kind?: CardioActivityKind;
  distance_km?: number;
  target_duration_minutes?: number;
  target_hr_zone?: HeartRateZone;
  cardio_format?: CardioFormat;
  intervals?: ExerciseIntervals;
  // ── class ──
  class_name?: string;
  swapped_from?: string;
  last_performance?: ExerciseLastPerformance;
}

export interface DashboardDayPlan {
  is_rest_day: boolean;
  focus?: string;
  estimated_duration_minutes?: number;
  ai_notes?: string;
  warmup?: DashboardExercise[];
  exercises?: DashboardExercise[];
  cooldown?: DashboardExercise[];
  manually_edited?: boolean;
}

export interface ActiveWorkoutPlan {
  id: string;
  week_start: string;
  is_active: boolean;
  ai_notes?: string;
  plan: Record<string, DashboardDayPlan>;
}

export interface PendingInsight {
  id: string;
  insight_type: string;
  payload: {
    ai_message: string;
    suggested_action: string;
    ui_action: string;
  };
  created_at: string;
}

/** Authoritative per-day workout completion for the current Monday-start week. */
export interface CompletedDay {
  session_id: string;
  completed_at: string;
}

export interface DashboardResponse {
  success: boolean;
  data: {
    active_workout_plan: ActiveWorkoutPlan | null;
    pending_insights: PendingInsight[];
    /** Keyed by weekday name (`monday`…`sunday`) for the current week; absent days aren't done. */
    completed_days?: Record<string, CompletedDay>;
    /**
     * This week's activities outside guided workouts (coach-logged, quick-logged, watch
     * imports), keyed by local `YYYY-MM-DD`, oldest first. `{}` when empty or unavailable.
     */
    week_activities?: Record<string, ActivityItem[]>;
  };
}

/** Stable icon enum for health insights (see API_docs). Unknown values coerce to `general`. */
export type HealthInsightIcon =
  | 'heart_pulse'
  | 'sleep'
  | 'steps'
  | 'stress'
  | 'energy'
  | 'calories'
  | 'workout'
  | 'trophy'
  | 'trending_up'
  | 'general';

export interface HealthInsight {
  title: string;
  description: string;
  icon: HealthInsightIcon | string;
}

/** Activity summary for the current week, all computed in the user's timezone. */
export interface WeeklyActivityStats {
  consistency_streak_days: number;
  workouts_this_week: number;
  minutes_trained_this_week: number;
}

/** Per-field trend direction over the last 7 days vs. the 7 before; `null` when data is missing. */
export type HealthTrendDirection = 'up' | 'down' | 'flat';

/** The metric keys that carry an `avg_*` value and a `trends.*` direction. */
export type HealthSummaryMetric =
  | 'sleep_hours'
  | 'sleep_quality'
  | 'stress_level'
  | 'energy_level'
  | 'resting_heart_rate'
  | 'steps'
  | 'active_calories';

/** Deterministic health-metric aggregates over the last `window_days` (see API_docs). */
export interface HealthSummary {
  window_days: number;
  days_logged: number;
  avg_sleep_hours: number | null;
  avg_sleep_quality: number | null;
  avg_stress_level: number | null;
  avg_energy_level: number | null;
  avg_resting_heart_rate: number | null;
  avg_steps: number | null;
  avg_active_calories: number | null;
  trends: Record<HealthSummaryMetric, HealthTrendDirection | null>;
}

export interface ProgressResponse {
  success: boolean;
  data: {
    current_level: number;
    current_xp: number;
    xp_to_next_level: number;
    this_week: WeeklyActivityStats;
    health_summary: HealthSummary;
    /** Always `[]` on this endpoint — insight cards now come from `getProgressInsights`. */
    health_insights: HealthInsight[];
    /** Pre-computed progress signals; absent on an older backend. */
    progress_snapshot?: ProgressSnapshot | null;
  };
}

// ─── Activities (outside guided workouts) + watch import ──────────────────────

export type ActivitySource = 'app' | 'coach' | 'health_connect' | 'apple_health';

/** Five values, Z1..Z5. Seconds on an activity; minutes per week on the snapshot. */
export type ZoneSeconds = [number, number, number, number, number];

/** One activity from `GET /activities` or the dashboard's `week_activities`. */
export interface ActivityItem {
  id: string;
  activity_type: ActivityType;
  /** Device label (e.g. "Run", "Treadmill run"); `null` for app/coach rows. */
  name: string | null;
  /** Strength session imported from a device (`activity_type` is `other`). */
  is_strength: boolean;
  started_at: string | null;
  completed_at: string;
  duration_minutes: number | null;
  distance_km: number | null;
  xp_earned: number;
  /** For imports, the device title when one was set. */
  notes: string | null;
  source: ActivitySource;
  /** Data-origin package of a device import. */
  source_app: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  hr_coverage: number | null;
  /** Z1..Z5 seconds; `null` without HR data **or** without a zone model (no birth year). */
  seconds_in_zone: ZoneSeconds | null;
}

export interface ZoneModel {
  max_hr: number;
  resting_hr: number | null;
  method: 'hrr' | 'percent_max';
  /** Lower bpm bound of Z1..Z5. */
  floors: number[];
}

export interface ActivitiesResponse {
  success: boolean;
  activities: ActivityItem[];
  /** `null` when the profile has neither a birth year nor a max-HR override. */
  zone_model: ZoneModel | null;
}

/** One watch-recorded session for `POST /activities/import`. */
export interface ImportedActivityInput {
  source: 'health_connect' | 'apple_health';
  source_app: string | null;
  /** Idempotency key — the device record id. */
  source_record_id: string;
  /** Health Connect `ExerciseType` constant; the server maps it. */
  exercise_type: number;
  title: string | null;
  started_at: string;
  completed_at: string;
  distance_km: number | null;
  /** Mean bpm per bucket from ONE origin; `null` = an empty bucket. */
  heart_rate: { bucket_seconds: number; samples: (number | null)[] } | null;
}

export type ActivityImportOutcome =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'merged'
  | 'linked_to_workout'
  | 'skipped';

export interface ActivityImportResult {
  source_record_id: string;
  outcome: ActivityImportOutcome;
  activity_id?: string;
  /** Only on `created`. */
  xp_earned?: number;
  /** Only on `skipped`. */
  reason?: string;
}

export interface ImportActivitiesResponse {
  success: boolean;
  /** In input order. */
  results: ActivityImportResult[];
  total_xp_earned: number;
  new_total_xp: number;
}

// ─── Body measurements + progress snapshot ────────────────────────────────────

/** A tracked body/fitness metric. The canonical unit is part of the name. */
export type BodyMetric =
  | 'weight_kg'
  | 'body_fat_pct'
  | 'lean_mass_kg'
  | 'waist_cm'
  | 'hip_cm'
  | 'chest_cm'
  | 'arm_cm'
  | 'thigh_cm'
  | 'vo2max_ml_kg_min';

export type BodyMeasurementSource = 'manual' | 'coach' | 'health_connect' | 'apple_health';

/** One stored value from `GET /body/measurements`. */
export interface BodyMeasurement {
  id: string;
  metric: BodyMetric;
  /** Always in the canonical unit named by `metric`. */
  value: number;
  measured_at: string;
  source: BodyMeasurementSource;
  /** Device data-origin package, e.g. `com.garmin.android.apps.connectmobile`. */
  source_app: string | null;
  note: string | null;
  created_at: string;
}

export interface BodyMeasurementInput {
  /** `height_cm` is device-only: it fills an empty profile height, never stored as a row. */
  metric: BodyMetric | 'height_cm';
  value: number;
  measured_at: string;
  /** Default `manual`. `coach` is reserved for the chat tool. */
  source?: 'manual' | 'health_connect' | 'apple_health';
  source_app?: string | null;
  /** Required for device sources — the idempotency key. */
  source_record_id?: string | null;
  /** Manual rows only. */
  note?: string | null;
}

export interface BodyMeasurementSaveResult {
  index: number;
  outcome: 'saved' | 'skipped';
  id?: string;
  reason?: string;
}

export interface BodyMeasurementsResponse {
  success: boolean;
  measurements: BodyMeasurement[];
}

export interface BodyMeasurementSaveResponse {
  success: boolean;
  /** In input order — a bad item is skipped, never fails the batch. */
  results: BodyMeasurementSaveResult[];
  height_cm_updated?: number;
}

export interface BodyMeasurementQuery {
  metric?: BodyMetric;
  /** ISO date or date-time; a bare date covers the whole UTC day. */
  from?: string;
  to?: string;
  /** 1–500, default 200. */
  limit?: number;
}

export type SignalTrend = 'up' | 'down' | 'flat';

export interface StrengthGain {
  name: string;
  /** `e1rm_kg` for loaded lifts (always kg); `reps` for bodyweight moves. */
  measure: 'e1rm_kg' | 'reps';
  from: number;
  to: number;
}

export interface MeasurementChange {
  metric: Exclude<BodyMetric, 'weight_kg'>;
  latest: number;
  /** latest − earliest in 90 days; `null` with a single reading or < 7 days apart. */
  change: number | null;
  /** YYYY-MM-DD of the earliest reading the change is measured from. */
  since: string;
}

/**
 * Pre-computed progress signals (`GET /progress` → `progress_snapshot`) — the same object
 * the coach is prompted with. **Every field is nullable and `null` means "not tracked"**:
 * render nothing for it and never nag the user to fill it in.
 */
export interface ProgressSnapshot {
  window_days: number;
  consistency: { sessions_per_week: number; active_days: number; trend: SignalTrend | null } | null;
  strength: { exercises_tracked: number; exercises_improved: number; top_gains: StrengthGain[] } | null;
  weight: {
    /** Mean of daily means over the latest 7 days with readings — the headline, never one weigh-in. */
    latest_kg: number;
    /** Least-squares slope; `null` with < 3 weigh-in days or < 10-day span. */
    trend_kg_per_week: number | null;
    change_kg: number | null;
    span_days: number;
    weigh_in_days: number;
  } | null;
  measurements: MeasurementChange[];
  waist_to_height: number | null;
  resting_hr: { avg_7d: number; change: number | null } | null;
  sleep: { avg_hours_7d: number } | null;
  steps: { avg_7d: number; change_pct: number | null } | null;
  cardio: {
    minutes_per_week: number;
    sessions: number;
    /** Weekly minutes in Z1..Z5; `null` without HR data or a zone model. */
    zone_minutes_per_week?: ZoneSeconds | null;
  } | null;
  nutrition: { days_logged: number; avg_protein_g: number | null } | null;
}

/** AI-generated insight cards, served separately + cached so the main screen never blocks. */
export interface ProgressInsightsResponse {
  success: boolean;
  data: {
    health_insights: HealthInsight[];
    generated_at: string | null;
    /** `true` only when regeneration failed and an expired cached set was returned. */
    stale: boolean;
  };
}

export interface ChatHistoryMessage {
  id: string;
  user_id: string;
  session_id: string | null;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

export interface ChatHistoryResponse {
  success: boolean;
  messages: ChatHistoryMessage[];
}

export type ChatSessionStatus = 'open' | 'closed';

export interface ChatSessionSummaryJson {
  key_facts?: string[];
  commitments?: string[];
  emotional_state?: string;
  decisions?: string[];
  one_line?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  session_date: string;
  status: ChatSessionStatus;
  title: string | null;
  summary: string | null;
  summary_json: ChatSessionSummaryJson | null;
  message_count: number;
  started_at: string;
  closed_at: string | null;
  consolidated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionsResponse {
  success: boolean;
  sessions: ChatSession[];
}

export interface CreateChatSessionResponse {
  success: boolean;
  session: ChatSession;
}

export interface ActivityLogResponse {
  status: 'success';
  xp_earned: number;
  new_total_xp: number;
  leveled_up: boolean;
}

export interface NutritionLogResponse {
  id: string;
  meal_description: string;
  estimated_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ai_feedback: string | null;
  logged_at: string;
}

/** A stored meal row from `GET /api/nutrition/logs` (superset of the POST response). */
export interface NutritionLogEntry {
  id: string;
  user_id: string;
  logged_at: string;
  meal_description: string;
  estimated_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ai_feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface NutritionLogsResponse {
  success: boolean;
  logs: NutritionLogEntry[];
}

// ─── Workout / exercise types ─────────────────────────────────────────────────

export type WeightUnit = 'kg' | 'lb';
export type WorkoutSection = 'warmup' | 'main' | 'cooldown';

export interface ExerciseDetail {
  id: string;
  name: string;
  gif_url: string | null;
  image_url: string | null;
  video_url: string | null;
  instructions: string[];
  tips: string[];
  variations: string[];
  target: string | null;
  target_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  equipments: string[];
  body_part: string | null;
  body_parts: string[];
  exercise_type: string | null;
  overview: string | null;
  related_exercise_ids: string[];
}

export interface ExerciseDetailResponse {
  success: boolean;
  exercise: ExerciseDetail;
}

export interface LoggedSet {
  set_number: number;
  reps?: number | null;
  weight?: number | null;
  weight_unit?: WeightUnit | null;
  duration_seconds?: number | null;
  completed: boolean;
}

export interface LoggedExercise {
  exercise_id?: string;
  name: string;
  section: WorkoutSection;
  /**
   * Send the plan exercise's type through — it selects the effort-XP tier. Without it the
   * server can only derive timed-vs-reps from set durations, never cardio/class/mobility.
   */
  type?: ExerciseType;
  /** Cardio only — the distance the user reported. Feeds the proportional cardio XP. */
  distance_km?: number;
  swapped_from?: string | null;
  skipped?: boolean;
  sets: LoggedSet[];
}

export interface WorkoutLogPayload {
  plan_id?: string;
  day?: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  exercises: LoggedExercise[];
}

/** One row of the per-exercise XP tally returned by `POST /workouts/log`. */
export interface XpBreakdownEntry {
  name: string;
  type: ExerciseType;
  xp: number;
  /** `true` when the +5 beat-your-previous-best bonus applied — worth celebrating. */
  improved?: boolean;
}

export interface WorkoutLogResponse {
  success: boolean;
  /**
   * ⚠ Variable — XP is effort-based (mobility 5, reps/timed 10, class 75, cardio
   * proportional to distance/time), so never assume a flat value.
   */
  xp_earned: number;
  new_total_xp: number;
  leveled_up: boolean;
  /** Absent on the `/activity/log` fallback path and on pre-rollout backends. */
  xp_breakdown?: XpBreakdownEntry[];
  summary: {
    total_sets: number;
    duration_seconds: number;
  };
}

// ─── Workout history (Progress) ───────────────────────────────────────────────

/**
 * A completed workout session header from `GET /api/workouts/sessions`
 * (mirrors the backend `workout_sessions` row). The per-set detail lives in a
 * separate `GET /api/workouts/sessions/{id}` call.
 */
export interface WorkoutSessionSummary {
  id: string;
  user_id: string;
  plan_id: string | null;
  /** Backend weekday key the session came from (`monday`…`sunday`), or null. */
  day: string | null;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  total_sets: number;
  xp_earned: number;
  created_at: string;
}

/** A single logged set from a session (mirrors the backend `workout_set_logs` row). */
export interface WorkoutSetLogEntry {
  id: string;
  session_id: string;
  user_id: string;
  exercise_id: string | null;
  name: string;
  section: WorkoutSection;
  swapped_from: string | null;
  skipped: boolean;
  set_number: number;
  reps: number | null;
  weight: number | null;
  weight_unit: WeightUnit | null;
  duration_seconds: number | null;
  completed: boolean;
  created_at: string;
}

/** `GET /api/workouts/sessions` — recent completed sessions, most-recent first. */
export interface WorkoutSessionsResponse {
  success: boolean;
  sessions: WorkoutSessionSummary[];
}

/** `GET /api/workouts/sessions/{id}` — one session header plus its per-set logs. */
export interface WorkoutSessionDetailResponse {
  success: boolean;
  session: WorkoutSessionSummary;
  sets: WorkoutSetLogEntry[];
}

// ─── Plan viewing / editing (Day Detail) ──────────────────────────────────────

export interface WorkoutPlan {
  id: string;
  user_id?: string;
  week_start: string;
  is_active: boolean;
  ai_notes: string | null;
  plan: Record<string, DashboardDayPlan>;
  created_at?: string;
  updated_at?: string;
}

export interface WorkoutPlanResponse {
  success: boolean;
  plan: WorkoutPlan | null;
}

export interface DayPatchResponse {
  success: boolean;
  day: string;
  plan: DashboardDayPlan;
}

export interface CatalogExerciseSummary {
  id: string;
  name: string;
  image_url: string | null;
  target: string | null;
  body_part?: string | null;
  equipment: string | null;
}

export interface ExerciseSearchResponse {
  success: boolean;
  exercises: CatalogExerciseSummary[];
  /** Best-effort count: provider-reported when browsing, else result count. */
  total: number;
  /** Cursor for the next browse page, or `null` on the last page / any name search. */
  next_cursor: string | null;
}

export interface ExerciseAlternative extends CatalogExerciseSummary {
  why: string;
}

export interface ExerciseAlternativesResponse {
  success: boolean;
  alternatives: ExerciseAlternative[];
}

export interface ExerciseBatchResponse {
  success: boolean;
  exercises: ExerciseDetail[];
}

export interface LastPerformance {
  reps?: number | null;
  weight?: number | null;
  weight_unit?: WeightUnit | null;
  performed_at?: string;
}

export interface LastPerformanceResponse {
  success: boolean;
  last: LastPerformance | null;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

function resolveApiBaseUrl(rawBaseUrl: string): string {
  return rawBaseUrl.replace(/\/$/, '');
}

function createNetworkErrorMessage(targetUrl: string): string {
  return [
    `Network request failed before reaching backend: ${targetUrl}`,
    'Ensure the backend is running and reachable from the browser,',
    'and that CORS allows this origin.',
  ].join(' ');
}

async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<T> {
  if (!env.hasApiConfig) {
    throw new Error(
      'Missing VITE_API_BASE_URL or VITE_AZURE_FUNCTION_KEY. Add them to your .env before calling the backend.',
    );
  }

  const baseUrl = resolveApiBaseUrl(env.apiBaseUrl);
  const targetUrl = `${baseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-functions-key': env.azureFunctionKey,
        ...init?.headers,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new Error(`${createNetworkErrorMessage(targetUrl)} Original error: ${message}`);
  }

  if (!response.ok) {
    let errorMessage = 'The request failed.';
    try {
      const errorBody = (await response.json()) as ApiErrorBody;
      errorMessage = errorBody.error ?? errorBody.message ?? errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

// ─── Endpoint helpers ─────────────────────────────────────────────────────────

export async function getProfile(accessToken: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/profile', accessToken);
}

export async function updateProfile(
  accessToken: string,
  payload: ProfilePayload,
): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/profile', accessToken, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ─── Coach memory ─────────────────────────────────────────────────────────────

/**
 * Everything the coach currently remembers about the user: permanent facts plus
 * temporary ones that have not expired, oldest first.
 *
 * Not folded into `getProfile` on purpose — the profile is cached in
 * `localStorage` and served stale-while-revalidate, while memory changes on its
 * own schedule (every chat-session rollover consolidates new facts), so it wants
 * its own fetch rather than a stale cached copy.
 */
export async function getUserMemory(accessToken: string): Promise<UserMemoryListResponse> {
  return apiFetch<UserMemoryListResponse>('/profile/memory', accessToken);
}

/** Adds a fact the user typed themselves. Stored with `origin: 'user'`. */
export async function createUserMemory(
  accessToken: string,
  payload: UserMemoryPayload & { content: string },
): Promise<UserMemoryItemResponse> {
  return apiFetch<UserMemoryItemResponse>('/profile/memory', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Rewrites one active fact — coach-written ones included; that is the point. */
export async function updateUserMemory(
  accessToken: string,
  memoryId: string,
  payload: UserMemoryPayload,
): Promise<UserMemoryItemResponse> {
  return apiFetch<UserMemoryItemResponse>(
    `/profile/memory/${encodeURIComponent(memoryId)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

/**
 * Makes the coach forget one fact (soft delete server-side). The coach can still
 * re-learn it from a later conversation — this clears what is stored, it does not
 * blacklist the subject.
 */
export async function deleteUserMemory(
  accessToken: string,
  memoryId: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/profile/memory/${encodeURIComponent(memoryId)}`,
    accessToken,
    { method: 'DELETE' },
  );
}

/**
 * Permanently deletes the signed-in user's account and every row that belongs to
 * them (the backend drops the Supabase auth user; FK cascades do the rest).
 * Immediate and irreversible — only call this behind an explicit confirmation,
 * and clear the local session afterwards (`useAuth().deleteAccount` does both).
 */
export async function deleteAccount(accessToken: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/account', accessToken, { method: 'DELETE' });
}

export async function getDashboard(accessToken: string): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>('/dashboard', accessToken);
}

export async function getProgress(accessToken: string): Promise<ProgressResponse> {
  return apiFetch<ProgressResponse>('/progress', accessToken);
}

/**
 * AI-generated health-trend insight cards (cached server-side, may take a few seconds on a
 * cache miss). Call this asynchronously — never block the Progress screen on it.
 */
export async function getProgressInsights(accessToken: string): Promise<ProgressInsightsResponse> {
  return apiFetch<ProgressInsightsResponse>('/progress/insights', accessToken);
}

// ─── Body measurements ────────────────────────────────────────────────────────

export async function getBodyMeasurements(
  accessToken: string,
  q: BodyMeasurementQuery = {},
): Promise<BodyMeasurementsResponse> {
  const query = new URLSearchParams();
  if (q.metric) query.set('metric', q.metric);
  if (q.from) query.set('from', q.from);
  if (q.to) query.set('to', q.to);
  if (q.limit != null) query.set('limit', String(q.limit));
  const qs = query.toString();
  return apiFetch<BodyMeasurementsResponse>(`/body/measurements${qs ? `?${qs}` : ''}`, accessToken);
}

/** Batch save (1–200) — manual entry and device sync alike. Check each `results[i].outcome`. */
export async function saveBodyMeasurements(
  accessToken: string,
  measurements: BodyMeasurementInput[],
): Promise<BodyMeasurementSaveResponse> {
  return apiFetch<BodyMeasurementSaveResponse>('/body/measurements', accessToken, {
    method: 'POST',
    body: JSON.stringify({ measurements }),
  });
}

/** Edits a `manual`/`coach` row. Device rows are read-only (409). */
export async function updateBodyMeasurement(
  accessToken: string,
  measurementId: string,
  patch: { value?: number; measured_at?: string; note?: string | null },
): Promise<{ success: boolean; measurement: BodyMeasurement }> {
  return apiFetch<{ success: boolean; measurement: BodyMeasurement }>(
    `/body/measurements/${encodeURIComponent(measurementId)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

/** Hard-deletes a `manual`/`coach` row. Device rows are read-only (409). */
export async function deleteBodyMeasurement(
  accessToken: string,
  measurementId: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/body/measurements/${encodeURIComponent(measurementId)}`,
    accessToken,
    { method: 'DELETE' },
  );
}

export async function getChatHistory(
  accessToken: string,
  limit = 50,
  offset = 0,
  sessionId?: string,
): Promise<ChatHistoryResponse> {
  const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
  return apiFetch<ChatHistoryResponse>(
    `/chat/history?limit=${limit}&offset=${offset}${sessionParam}`,
    accessToken,
  );
}

export async function getChatSessions(
  accessToken: string,
  limit = 30,
  offset = 0,
): Promise<ChatSessionsResponse> {
  return apiFetch<ChatSessionsResponse>(`/chat/sessions?limit=${limit}&offset=${offset}`, accessToken);
}

/** Force-starts a new chat session, closing (and queuing summarization of) the current one. */
export async function createChatSession(accessToken: string): Promise<CreateChatSessionResponse> {
  return apiFetch<CreateChatSessionResponse>('/chat/sessions', accessToken, { method: 'POST' });
}

export async function logActivity(
  accessToken: string,
  payload: ActivityLogPayload,
): Promise<ActivityLogResponse> {
  return apiFetch<ActivityLogResponse>('/activity/log', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Activities outside guided workouts, newest first, with HR zones derived on read. */
export async function getActivities(
  accessToken: string,
  q: { days?: number; limit?: number } = {},
): Promise<ActivitiesResponse> {
  const query = new URLSearchParams();
  if (q.days != null) query.set('days', String(q.days));
  if (q.limit != null) query.set('limit', String(q.limit));
  const qs = query.toString();
  return apiFetch<ActivitiesResponse>(`/activities${qs ? `?${qs}` : ''}`, accessToken);
}

export async function getExerciseDetail(
  accessToken: string,
  exerciseId: string,
): Promise<ExerciseDetailResponse> {
  return apiFetch<ExerciseDetailResponse>(`/exercises/${encodeURIComponent(exerciseId)}`, accessToken);
}

export async function getWorkoutPlan(
  accessToken: string,
  planId?: string,
): Promise<WorkoutPlanResponse> {
  const query = planId ? `?planId=${encodeURIComponent(planId)}` : '';
  return apiFetch<WorkoutPlanResponse>(`/workouts/plan${query}`, accessToken);
}

export async function updatePlanDay(
  accessToken: string,
  planId: string,
  day: string,
  dayPlan: DashboardDayPlan,
): Promise<DayPatchResponse> {
  return apiFetch<DayPatchResponse>(
    `/workouts/plan/${encodeURIComponent(planId)}/day/${encodeURIComponent(day)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(dayPlan) },
  );
}

export interface ExerciseSearchParams {
  search: string;
  body_part?: string;
  equipment?: string;
  limit?: number;
  /** Name-search mode only — slice offset within the bounded result set. */
  offset?: number;
  /** Browse mode only (blank `search`) — the `next_cursor` from a prior page. */
  cursor?: string;
}

export async function searchExercises(
  accessToken: string,
  params: ExerciseSearchParams,
): Promise<ExerciseSearchResponse> {
  const query = new URLSearchParams({ search: params.search });
  if (params.body_part) query.set('body_part', params.body_part);
  if (params.equipment) query.set('equipment', params.equipment);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  if (params.cursor) query.set('cursor', params.cursor);
  return apiFetch<ExerciseSearchResponse>(`/exercises?${query.toString()}`, accessToken);
}

export async function getExerciseAlternatives(
  accessToken: string,
  exerciseId: string,
  limit = 6,
): Promise<ExerciseAlternativesResponse> {
  return apiFetch<ExerciseAlternativesResponse>(
    `/exercises/${encodeURIComponent(exerciseId)}/alternatives?limit=${limit}`,
    accessToken,
  );
}

export async function getExercisesBatch(
  accessToken: string,
  ids: string[],
): Promise<ExerciseBatchResponse> {
  return apiFetch<ExerciseBatchResponse>('/exercises/batch', accessToken, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function getLastPerformance(
  accessToken: string,
  exerciseId: string,
): Promise<LastPerformanceResponse> {
  return apiFetch<LastPerformanceResponse>(
    `/workouts/last-performance?exercise_id=${encodeURIComponent(exerciseId)}`,
    accessToken,
  );
}

/**
 * Logs a completed guided workout with per-set actuals.
 * Falls back to POST /activity/log (full_workout) when /workouts/log is not
 * available on the backend, so XP still awards.
 */
export async function logWorkout(
  accessToken: string,
  payload: WorkoutLogPayload,
): Promise<WorkoutLogResponse> {
  const totalSets = payload.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0,
  );

  try {
    return await apiFetch<WorkoutLogResponse>('/workouts/log', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    const fallback = await logActivity(accessToken, {
      activity_type: 'full_workout',
      duration_minutes: Math.max(1, Math.round(payload.duration_seconds / 60)),
    });
    return {
      success: fallback.status === 'success',
      xp_earned: fallback.xp_earned,
      new_total_xp: fallback.new_total_xp,
      leveled_up: fallback.leveled_up,
      summary: { total_sets: totalSets, duration_seconds: payload.duration_seconds },
    };
  }
}

/** Recent completed workout sessions (most-recent first) for the Progress history list. */
export async function getWorkoutSessions(
  accessToken: string,
  limit = 50,
): Promise<WorkoutSessionsResponse> {
  return apiFetch<WorkoutSessionsResponse>(`/workouts/sessions?limit=${limit}`, accessToken);
}

/** A single workout session plus every per-set log recorded for it. */
export async function getWorkoutSession(
  accessToken: string,
  sessionId: string,
): Promise<WorkoutSessionDetailResponse> {
  return apiFetch<WorkoutSessionDetailResponse>(
    `/workouts/sessions/${encodeURIComponent(sessionId)}`,
    accessToken,
  );
}

export async function submitPulse(
  accessToken: string,
  stress_level: number,
  date?: string,
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/health/pulse', accessToken, {
    method: 'POST',
    body: JSON.stringify({ stress_level, ...(date ? { date } : {}) }),
  });
}

export async function syncHealth(
  accessToken: string,
  payload: HealthSyncPayload,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/health/sync', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Reads back a single day's manual health capture (or `null`). The Home snapshot
 * and capture dialog use this as the authoritative, cross-device source so a log
 * made on another device shows up here too.
 */
export async function getHealthLog(
  accessToken: string,
  date: string,
): Promise<HealthLogResponse> {
  return apiFetch<HealthLogResponse>(`/health/logs?date=${encodeURIComponent(date)}`, accessToken);
}

/** Recent manual health captures (most-recent first). */
export async function getHealthLogs(
  accessToken: string,
  limit = 30,
): Promise<HealthLogsResponse> {
  return apiFetch<HealthLogsResponse>(`/health/logs?limit=${limit}`, accessToken);
}

export async function logNutrition(
  accessToken: string,
  payload: NutritionLogPayload,
): Promise<NutritionLogResponse> {
  return apiFetch<NutritionLogResponse>('/nutrition/log', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Recent meals (most-recent first) for the Fuel "Recent meals" history list. */
export async function getNutritionLogs(
  accessToken: string,
  limit = 20,
  offset = 0,
): Promise<NutritionLogsResponse> {
  return apiFetch<NutritionLogsResponse>(
    `/nutrition/logs?limit=${limit}&offset=${offset}`,
    accessToken,
  );
}

// ─── SSE Chat Stream ──────────────────────────────────────────────────────────

export type SseEventType = 'status' | 'chunk' | 'done' | 'error' | 'ping';

/**
 * Opens an SSE stream for POST /api/chat and calls the provided callbacks as
 * events arrive. Returns a cleanup function that aborts the request.
 * Preserves the resilient parser from the mobile app: infers event type from
 * payload shape when unnamed, tolerates non-JSON data lines, and has a
 * no-reader full-text fallback.
 */
export function streamChat(
  accessToken: string,
  message: string,
  callbacks: {
    onChunk: (text: string) => void;
    onDone: () => void;
    onError: (message: string) => void;
  },
  options?: { forceNewSession?: boolean },
): () => void {
  if (!env.hasApiConfig) {
    callbacks.onError('Missing VITE_API_BASE_URL or VITE_AZURE_FUNCTION_KEY.');
    return () => {};
  }

  const controller = new AbortController();
  const baseUrl = resolveApiBaseUrl(env.apiBaseUrl);
  const targetUrl = `${baseUrl}/chat`;

  let usingFullTextFallback = false;
  const fallbackChunkParts: string[] = [];

  void (async () => {
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-functions-key': env.azureFunctionKey,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message,
          ...(options?.forceNewSession ? { forceNewSession: true } : {}),
        }),
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      const msg = error instanceof Error ? error.message : 'Network request failed';
      callbacks.onError(`${createNetworkErrorMessage(targetUrl)} ${msg}`);
      return;
    }

    if (!response.ok) {
      let errorMessage = 'The chat request failed.';
      try {
        const body = (await response.json()) as ApiErrorBody;
        errorMessage = body.error ?? body.message ?? errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      callbacks.onError(errorMessage);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const parseSseBuffer = (raw: string): string => {
      const normalizedRaw = raw.replace(/\r\n/g, '\n');
      const events = normalizedRaw.split('\n\n');
      const complete = events.slice(0, -1);
      const remainder = events[events.length - 1] ?? '';

      for (const eventBlock of complete) {
        let eventType = '';
        const dataLines: string[] = [];

        for (const line of eventBlock.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        const dataLine = dataLines.join('\n');
        if (!dataLine) continue;

        const resolveEventType = (parsed: Record<string, unknown>): SseEventType | null => {
          if (
            eventType === 'status' ||
            eventType === 'chunk' ||
            eventType === 'done' ||
            eventType === 'error' ||
            eventType === 'ping'
          ) {
            return eventType;
          }
          const payloadType = parsed.type;
          if (
            payloadType === 'status' ||
            payloadType === 'chunk' ||
            payloadType === 'done' ||
            payloadType === 'error' ||
            payloadType === 'ping'
          ) {
            return payloadType;
          }
          if (typeof parsed.text === 'string') return 'chunk';
          if (typeof parsed.stage === 'string') return 'status';
          if (typeof parsed.success === 'boolean') return 'done';
          if (typeof parsed.message === 'string') return 'error';
          if (typeof parsed.timestamp === 'string') return 'ping';
          return null;
        };

        try {
          const parsed = JSON.parse(dataLine) as Record<string, unknown>;
          const resolvedType = resolveEventType(parsed);

          if (resolvedType === 'chunk') {
            const text = typeof parsed.text === 'string' ? parsed.text : '';
            if (text !== '') {
              if (usingFullTextFallback) fallbackChunkParts.push(text);
              else callbacks.onChunk(text);
            }
          } else if (resolvedType === 'done') {
            if (usingFullTextFallback) {
              const collapsedText = fallbackChunkParts.join('');
              const hasExplicitLineBreaks = collapsedText.includes('\n');
              const finalText = hasExplicitLineBreaks
                ? collapsedText
                : fallbackChunkParts.join('\n\n');
              if (finalText.trim() !== '') callbacks.onChunk(finalText);
            }
            callbacks.onDone();
          } else if (resolvedType === 'error') {
            const errMsg = typeof parsed.message === 'string' ? parsed.message : 'Stream error';
            callbacks.onError(errMsg);
          }
        } catch {
          if (dataLine.trim() !== '') {
            if (usingFullTextFallback) fallbackChunkParts.push(dataLine);
            else callbacks.onChunk(dataLine);
          }
        }
      }

      return remainder;
    };

    const reader = response.body?.getReader();
    if (!reader) {
      usingFullTextFallback = true;
      fallbackChunkParts.length = 0;
      try {
        const fullBody = await response.text();
        parseSseBuffer(`${fullBody}\n\n`);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        callbacks.onError('Unable to read chat response body.');
      }
      return;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseBuffer(buffer);
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        callbacks.onError('Stream read failed unexpectedly.');
      }
    }
  })();

  return () => {
    controller.abort();
  };
}
