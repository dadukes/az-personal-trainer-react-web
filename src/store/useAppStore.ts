import { create } from 'zustand';

import type { CoachPersonality, FitnessLevel, PrimaryGoal } from '@/lib/api';

export type { CoachPersonality, FitnessLevel, PrimaryGoal };

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

type AppStore = ProfileSlice & ChatSlice & GamificationSlice & HealthSlice;

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
}));
