# src/pages/ — screens & routing

Scoped guidance for the screens. See the root [CLAUDE.md](../../CLAUDE.md) for project-wide rules.

## Routing & auth guard

- `src/App.tsx` holds the **single routing authority** (React Router 7). Keep the guard logic
  there; don't scatter redirects across pages. `RequireAuth` enforces:
  - not authenticated → `/login`
  - authenticated but not onboarded → `/onboarding`
  - onboarded but on an auth route → `/`
  - and wraps authenticated pages in `<AppShell>`.
- Wait for `useAuth().initialized` before routing (shows the `Splash`).
- Onboarding completion is **dual-sourced** (keep both in sync): Supabase user metadata
  `onboardingCompleted` **and** the `localStorage` key `onboarding_complete_<userId>`.
- Profile uses **stale-while-revalidate**: cached profile from `localStorage` shows immediately,
  then a background `getProfile` refresh updates the store and re-persists (in `AuthProvider`).

## Routes → pages

| Route | Page | Notes |
|-------|------|-------|
| `/login` | `LoginPage` | Split gradient hero + sign-in/sign-up toggle |
| `/onboarding` | `OnboardingPage` | 3 steps; sends only backend-accepted profile fields |
| `/` | `HomePage` | Health snapshot + pulse + today's plan / CTA + week |
| `/coach` | `CoachPage` | SSE chat + quick replies + desktop context panel |
| `/fuel` | `FuelPage` | Drag-and-drop / file-input meal photo → `logNutrition` |
| `/progress` | `ProgressPage` | XP/level + AI health insights |
| `/plan/:day` | `PlanDayPage` | Read-only day plan (`getWorkoutPlan`) + start CTA |
| `/workout/:day` | `WorkoutSessionPage` | Guided set logging + timer → `logWorkout` |
| `/chat-history` | `ChatHistoryPage` | Past sessions (read-only transcripts) |

`:day` accepts a backend day key (`monday`…`sunday`) or `today` (resolved to the current weekday).

## Screen conventions

- Read cross-screen data from the Zustand store; refresh in a `useEffect` guarded against stale
  updates. Don't hold duplicate copies of store data.
- **Home**: dashboard + health load must stay resilient and non-blocking (fall back to
  placeholder/CTA). Empty `active_workout_plan` → the "Ready to plan your workout?" CTA.
- **Coach**: consume the `streamChat` SSE helper; render incremental chunks; keep the
  stop/retry/new-session affordances and the "scroll to latest" button.
- **Fuel**: read the file as a base64 data URL and post to `logNutrition`. "Recent meals" is
  session-local (no history endpoint — see [../../backend-gaps.md](../../backend-gaps.md)).
- **Progress**: `getProgress` returns level/XP + insights only; the "This week" stat tiles are
  **illustrative placeholders** pending a stats endpoint (see backend-gaps.md).

## UI & branding

- Use the design-system primitives from `src/components/ui.tsx` and the `AppShell` layout.
- Use brand tokens (CSS vars + `forma.*` Tailwind colors), not hardcoded hex.
- Keep light/dark consistent via `useAppTheme()`; screens read tokens that flip automatically.
- Section eyebrows are UPPERCASE with wide tracking; numbers/metrics are big and extrabold
  (use the `.tabular` class for tabular figures).
