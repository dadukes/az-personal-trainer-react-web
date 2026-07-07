import { create } from 'zustand';

import type {
  CoachPersonality,
  DashboardDayPlan,
  DashboardExercise,
  FitnessLevel,
  PrimaryGoal,
} from '@/lib/api';

export type { CoachPersonality, FitnessLevel, PrimaryGoal };

/** UI section keys; `main` maps to the plan's `exercises` array. */
export type PlanSection = 'warmup' | 'main' | 'cooldown';

const SECTION_FIELD: Record<PlanSection, 'warmup' | 'exercises' | 'cooldown'> = {
  warmup: 'warmup',
  main: 'exercises',
  cooldown: 'cooldown',
};

/** An unsaved, editable copy of a single day's plan, shared across the plan + exercise routes. */
export interface PlanDraft {
  planId?: string;
  day: string;
  dayPlan: DashboardDayPlan;
  dirty: boolean;
}

function mutateSection(
  dayPlan: DashboardDayPlan,
  section: PlanSection,
  fn: (list: DashboardExercise[]) => DashboardExercise[],
): DashboardDayPlan {
  const field = SECTION_FIELD[section];
  return { ...dayPlan, [field]: fn([...(dayPlan[field] ?? [])]) };
}

export interface UserProfile {
  display_name: string;
  coach_personality: CoachPersonality;
  fitness_level: FitnessLevel;
  primary_goal: PrimaryGoal | null;
  fears: string[] | null;
  limitations: string[] | null;
  preferred_duration_minutes: number;
  available_days: string[] | null;
  equipment_available: string[] | null;
  preferred_unit_system: 'metric' | 'imperial';
  timezone: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  card?: {
    title: string;
    duration: string;
    description: string;
    actionText: string;
  };
  isStreaming?: boolean;
  createdAt: string;
}

export interface GamificationState {
  current_level: number;
  current_xp: number;
  xp_to_next_level: number;
}

export interface HealthSnapshot {
  sleep_hours: number | null;
  resting_heart_rate: number | null;
  step_count: number | null;
  active_calories_burned: number | null;
}

export interface WorkoutDay {
  day: string;
  key: string;
  status: 'today' | 'planned' | 'rest';
  title: string;
  duration: string;
}

interface ProfileSlice {
  profile: UserProfile;
  setProfile: (profile: Partial<UserProfile>) => void;
}

interface ChatSlice {
  messages: ChatMessage[];
  isStreaming: boolean;
  chatError: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  removeMessage: (id: string) => void;
  appendStreamChunk: (id: string, chunk: string) => void;
  finalizeStream: (id: string) => void;
  setStreaming: (value: boolean) => void;
  setChatError: (error: string | null) => void;
  clearChat: () => void;
}

interface GamificationSlice {
  gamification: GamificationState;
  setGamification: (state: Partial<GamificationState>) => void;
  addXp: (xpEarned: number) => void;
}

interface HealthSlice {
  healthSnapshot: HealthSnapshot;
  weekPlan: WorkoutDay[];
  setHealthSnapshot: (snapshot: Partial<HealthSnapshot>) => void;
  setWeekPlan: (plan: WorkoutDay[]) => void;
}

interface PlanDraftSlice {
  planDraft: PlanDraft | null;
  /** Seeds the draft from the server plan, unless unsaved edits for the same day already exist. */
  initPlanDraft: (planId: string | undefined, day: string, dayPlan: DashboardDayPlan) => void;
  patchDraftExercise: (
    section: PlanSection,
    index: number,
    patch: Partial<DashboardExercise>,
  ) => void;
  replaceDraftExercise: (section: PlanSection, index: number, exercise: DashboardExercise) => void;
  addDraftExercise: (section: PlanSection, exercise: DashboardExercise) => void;
  removeDraftExercise: (section: PlanSection, index: number) => void;
  moveDraftExercise: (section: PlanSection, index: number, direction: -1 | 1) => void;
  /** Replaces the draft with the canonical saved plan and clears the dirty flag. */
  markPlanSaved: (dayPlan: DashboardDayPlan) => void;
  clearPlanDraft: () => void;
}

type AppStore = ProfileSlice & ChatSlice & GamificationSlice & HealthSlice & PlanDraftSlice;

export const INITIAL_PROFILE: UserProfile = {
  display_name: '',
  coach_personality: 'zen',
  fitness_level: 'beginner',
  primary_goal: null,
  fears: null,
  limitations: null,
  preferred_duration_minutes: 20,
  available_days: null,
  equipment_available: null,
  preferred_unit_system: 'metric',
  timezone: 'UTC',
};

const INITIAL_GAMIFICATION: GamificationState = {
  current_level: 1,
  current_xp: 0,
  xp_to_next_level: 500,
};

const INITIAL_HEALTH: HealthSnapshot = {
  sleep_hours: null,
  resting_heart_rate: null,
  step_count: null,
  active_calories_burned: null,
};

function mergeStreamChunk(existing: string, incoming: string): string {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const lastChar = existing[existing.length - 1] ?? '';
  const firstChar = incoming[0] ?? '';

  const hasBoundaryWhitespace = /\s/.test(lastChar) || /\s/.test(firstChar);
  if (hasBoundaryWhitespace) return existing + incoming;

  const looksWordLikeBoundary =
    /[A-Za-z0-9.,!?;:'")\]]/.test(lastChar) && /[A-Za-z0-9'"([]/.test(firstChar);

  return looksWordLikeBoundary ? `${existing} ${incoming}` : existing + incoming;
}

export const useAppStore = create<AppStore>((set) => ({
  // Profile
  profile: INITIAL_PROFILE,
  setProfile: (partial) => set((state) => ({ profile: { ...state.profile, ...partial } })),

  // Chat
  messages: [],
  isStreaming: false,
  chatError: null,
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  removeMessage: (id) => set((state) => ({ messages: state.messages.filter((m) => m.id !== id) })),
  appendStreamChunk: (id, chunk) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: mergeStreamChunk(m.content, chunk) } : m,
      ),
    })),
  finalizeStream: (id) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, isStreaming: false } : m)),
      isStreaming: false,
    })),
  setStreaming: (value) => set({ isStreaming: value }),
  setChatError: (error) => set({ chatError: error }),
  clearChat: () => set({ messages: [], chatError: null }),

  // Gamification
  gamification: INITIAL_GAMIFICATION,
  setGamification: (partial) =>
    set((state) => ({ gamification: { ...state.gamification, ...partial } })),
  addXp: (xpEarned) =>
    set((state) => {
      const newXp = state.gamification.current_xp + xpEarned;
      const newLevel = Math.floor(newXp / 500) + 1;
      const xpToNext = newLevel * 500;
      return {
        gamification: {
          current_xp: newXp,
          current_level: newLevel,
          xp_to_next_level: xpToNext,
        },
      };
    }),

  // Health
  healthSnapshot: INITIAL_HEALTH,
  weekPlan: [],
  setHealthSnapshot: (partial) =>
    set((state) => ({ healthSnapshot: { ...state.healthSnapshot, ...partial } })),
  setWeekPlan: (plan) => set({ weekPlan: plan }),

  // Plan draft (editable day plan)
  planDraft: null,
  initPlanDraft: (planId, day, dayPlan) =>
    set((state) => {
      const current = state.planDraft;
      if (current && current.day === day && current.planId === planId && current.dirty) {
        return {}; // keep unsaved edits
      }
      return { planDraft: { planId, day, dayPlan, dirty: false } };
    }),
  patchDraftExercise: (section, index, patch) =>
    set((state) => {
      if (!state.planDraft) return {};
      const dayPlan = mutateSection(state.planDraft.dayPlan, section, (list) =>
        list.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)),
      );
      return { planDraft: { ...state.planDraft, dayPlan, dirty: true } };
    }),
  replaceDraftExercise: (section, index, exercise) =>
    set((state) => {
      if (!state.planDraft) return {};
      const dayPlan = mutateSection(state.planDraft.dayPlan, section, (list) =>
        list.map((ex, i) => (i === index ? exercise : ex)),
      );
      return { planDraft: { ...state.planDraft, dayPlan, dirty: true } };
    }),
  addDraftExercise: (section, exercise) =>
    set((state) => {
      if (!state.planDraft) return {};
      const dayPlan = mutateSection(state.planDraft.dayPlan, section, (list) => [...list, exercise]);
      return { planDraft: { ...state.planDraft, dayPlan, dirty: true } };
    }),
  removeDraftExercise: (section, index) =>
    set((state) => {
      if (!state.planDraft) return {};
      const dayPlan = mutateSection(state.planDraft.dayPlan, section, (list) =>
        list.filter((_, i) => i !== index),
      );
      return { planDraft: { ...state.planDraft, dayPlan, dirty: true } };
    }),
  moveDraftExercise: (section, index, direction) =>
    set((state) => {
      if (!state.planDraft) return {};
      const target = index + direction;
      const dayPlan = mutateSection(state.planDraft.dayPlan, section, (list) => {
        if (target < 0 || target >= list.length) return list;
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
      return { planDraft: { ...state.planDraft, dayPlan, dirty: true } };
    }),
  markPlanSaved: (dayPlan) =>
    set((state) => (state.planDraft ? { planDraft: { ...state.planDraft, dayPlan, dirty: false } } : {})),
  clearPlanDraft: () => set({ planDraft: null }),
}));
