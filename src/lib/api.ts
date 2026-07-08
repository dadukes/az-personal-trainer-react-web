import { env } from '@/lib/env';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type CoachPersonality = 'cheerleader' | 'zen' | 'analyst';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type ActivityType = 'full_workout' | 'micro_win' | 'walk' | 'other';
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
}

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
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  success: boolean;
  profile: UserProfileData;
}

export interface ExerciseLastPerformance {
  reps?: number | null;
  weight?: number | null;
  weight_unit?: WeightUnit | null;
  performed_at?: string;
}

export interface DashboardExercise {
  name: string;
  sets?: number;
  reps?: string;
  rest_seconds?: number;
  duration_seconds?: number;
  exercise_id?: string;
  target_muscle?: string;
  body_part?: string;
  cues?: string[];
  notes?: string;
  target_weight?: number;
  weight_unit?: WeightUnit;
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

export interface ProgressResponse {
  success: boolean;
  data: {
    current_level: number;
    current_xp: number;
    xp_to_next_level: number;
    this_week: WeeklyActivityStats;
    health_insights: HealthInsight[];
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

export interface WorkoutLogResponse {
  success: boolean;
  xp_earned: number;
  new_total_xp: number;
  leveled_up: boolean;
  summary: {
    total_sets: number;
    duration_seconds: number;
  };
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
  total: number;
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

export async function updateProfile(accessToken: string, payload: ProfilePayload) {
  return apiFetch<{ success: boolean }>('/profile', accessToken, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getDashboard(accessToken: string): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>('/dashboard', accessToken);
}

export async function getProgress(accessToken: string): Promise<ProgressResponse> {
  return apiFetch<ProgressResponse>('/progress', accessToken);
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
  offset?: number;
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
