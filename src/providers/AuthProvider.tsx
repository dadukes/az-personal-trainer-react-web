import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { getProfile, type UserProfileData } from '@/lib/api';
import { env } from '@/lib/env';
import { getOnboardingStorageKey, supabase } from '@/lib/supabase';
import { INITIAL_PROFILE, useAppStore, type UserProfile } from '@/store/useAppStore';

// ─── Profile persistence helpers (localStorage) ───────────────────────────────

function getProfileStorageKey(userId: string): string {
  return `profile_v1_${userId}`;
}

function loadCachedProfile(userId: string): Partial<UserProfile> | null {
  try {
    const raw = localStorage.getItem(getProfileStorageKey(userId));
    return raw ? (JSON.parse(raw) as Partial<UserProfile>) : null;
  } catch {
    return null;
  }
}

function persistProfile(userId: string, profile: Partial<UserProfile>): void {
  try {
    localStorage.setItem(getProfileStorageKey(userId), JSON.stringify(profile));
  } catch {
    // Non-critical: stale-while-revalidate re-tries next session
  }
}

function clearPersistedProfile(userId: string): void {
  try {
    localStorage.removeItem(getProfileStorageKey(userId));
  } catch {
    // Non-critical
  }
}

/** Maps the backend profile shape onto the store's `UserProfile` slice. */
function mapApiProfileToStore(apiProfile: UserProfileData): Partial<UserProfile> {
  return {
    display_name: apiProfile.display_name ?? '',
    coach_personality: apiProfile.coach_personality,
    fitness_level: apiProfile.fitness_level,
    primary_goal: apiProfile.primary_goal ?? null,
    fears: apiProfile.fears ?? null,
    limitations: apiProfile.limitations ?? null,
    preferred_duration_minutes: apiProfile.preferred_duration_minutes,
    available_days: apiProfile.available_days ?? null,
    equipment_available: apiProfile.equipment_available ?? null,
    preferred_unit_system: apiProfile.preferred_unit_system,
    timezone: apiProfile.timezone,
  };
}

/** Pushes a fresh backend profile into the store and re-persists the cache. */
function commitProfile(userId: string, apiProfile: UserProfileData): void {
  const profileData = mapApiProfileToStore(apiProfile);
  useAppStore.getState().setProfile(profileData);
  persistProfile(userId, profileData);
}

/** Show cached profile immediately, then refresh from the API in the background. */
async function hydrateProfile(userId: string, accessToken: string): Promise<void> {
  const cached = loadCachedProfile(userId);
  if (cached) useAppStore.getState().setProfile(cached);

  try {
    const { profile: apiProfile } = await getProfile(accessToken);
    commitProfile(userId, apiProfile);
  } catch {
    // Background refresh failed — cached data (if any) remains
  }
}

interface Credentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  initialized: boolean;
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
  /** Applies a freshly-saved backend profile to the store + cache (used by the profile editor). */
  applyProfileUpdate: (profile: UserProfileData) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function resolveOnboardingState(nextSession: Session | null): boolean {
  if (!nextSession?.user) return false;
  if (nextSession.user.user_metadata?.onboardingCompleted === true) {
    localStorage.setItem(getOnboardingStorageKey(nextSession.user.id), 'true');
    return true;
  }
  return localStorage.getItem(getOnboardingStorageKey(nextSession.user.id)) === 'true';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      setSession(initialSession);
      setHasCompletedOnboarding(resolveOnboardingState(initialSession));
      setInitialized(true);

      if (initialSession?.user && initialSession.access_token) {
        void hydrateProfile(initialSession.user.id, initialSession.access_token);
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setHasCompletedOnboarding(resolveOnboardingState(nextSession));
      setInitialized(true);

      if (nextSession?.user && nextSession.access_token) {
        void hydrateProfile(nextSession.user.id, nextSession.access_token);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const assertSupabaseConfig = useCallback(() => {
    if (!env.hasSupabaseConfig) {
      throw new Error(
        'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Add them to your .env before signing in.',
      );
    }
  }, []);

  const signIn = useCallback(
    async ({ email, password }: Credentials) => {
      assertSupabaseConfig();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [assertSupabaseConfig],
  );

  const signUp = useCallback(
    async ({ email, password }: Credentials) => {
      assertSupabaseConfig();
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    [assertSupabaseConfig],
  );

  const signOut = useCallback(async () => {
    const userId = session?.user.id;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    if (userId) {
      localStorage.removeItem(getOnboardingStorageKey(userId));
      clearPersistedProfile(userId);
    }

    useAppStore.getState().setProfile({ ...INITIAL_PROFILE });
    useAppStore.getState().clearChat();
    setHasCompletedOnboarding(false);
  }, [session?.user.id]);

  const applyProfileUpdate = useCallback(
    (apiProfile: UserProfileData) => {
      if (!session?.user) return;
      commitProfile(session.user.id, apiProfile);
    },
    [session?.user],
  );

  const markOnboardingComplete = useCallback(async () => {
    if (!session?.user) {
      throw new Error('You need an active session before completing onboarding.');
    }

    localStorage.setItem(getOnboardingStorageKey(session.user.id), 'true');
    setHasCompletedOnboarding(true);

    const { error } = await supabase.auth.updateUser({
      data: { onboardingCompleted: true },
    });
    if (error) throw error;
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      hasCompletedOnboarding,
      signIn,
      signUp,
      signOut,
      markOnboardingComplete,
      applyProfileUpdate,
    }),
    [
      applyProfileUpdate,
      hasCompletedOnboarding,
      initialized,
      markOnboardingComplete,
      session,
      signIn,
      signOut,
      signUp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
