import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

// On web the Supabase client persists the session in localStorage by default.
// detectSessionInUrl stays on so magic-link / email confirmation redirects work.
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function getOnboardingStorageKey(userId: string): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `onboarding_complete_${safeUserId}`;
}
