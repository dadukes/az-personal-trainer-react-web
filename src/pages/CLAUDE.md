# src/pages/ — screens & routing

Scoped guidance for the screens. See the root [CLAUDE.md](../../CLAUDE.md) for project-wide rules.

## Routing & auth guard

- `src/App.tsx` holds the **single routing authority** (React Router 7). Keep the guard logic
  there; don't scatter redirects across pages. `RequireAuth` enforces:
  - not authenticated → `/login`
  - authenticated but not onboarded → `/onboarding`
  - onboarded but on an auth route → `/`
  - and wraps authenticated pages in `<AppShell>`.
- **`/delete-account` is deliberately public** — it is the account-deletion URL published in
  the Play Console listing, so it must render for a visitor with no session and no app
  install. It therefore sits outside `RequireAuth` **and** outside `AppShell`, and carries
  its own sign-in step rather than routing through `/login` (which would drop the user on
  Home after authenticating). Don't "fix" it by putting it behind the guard.
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
| `/` | `HomePage` | Health snapshot + today's plan / CTA + week strip; every manual-capture dialog (workout, health data, body measurement) hangs off the `QuickActionsFab` |
| `/coach` | `CoachPage` | SSE chat + quick replies + desktop context panel |
| `/fuel` | `FuelPage` | Drag-and-drop / file-input meal photo → `logNutrition` |
| `/progress` | `ProgressPage` | XP/level + `this_week` tiles + **Your progress** (`progress_snapshot` + body measurements) + health trends chart + AI health insights |
| `/activities` | `ActivitiesPage` | Every session newest first: guided workouts + watch imports + coach/quick logs from `GET /history`, cursor-paged (loads as the end scrolls into view; "Load older" fallback), grouped by Mon–Sun week with the server's whole-week totals |
| `/activities/:id` | `ActivityDetailPage` | One activity (`getActivity`): stats (duration, distance, pace/speed, XP), `HeartRateCard`, note. **Edit** for coach/quick logs (`ActivityEditDialog`); imports are read-only |
| `/activities/workout/:id` | `WorkoutDetailPage` | One guided workout (`getWorkoutSession`): plan-day title, duration/sets/volume/XP, linked watch HR (`HeartRateCard`), sets by section |
| `/progress/workouts`, `/progress/workouts/:id` | redirects | Old links → `/activities`, `/activities/workout/:id` |
| `/profile` | `ProfilePage` | Edit onboarding/profile data (`updateProfile` PUT → `applyProfileUpdate`) incl. the optional **Body & heart rate** fields + **coach memory** (`CoachMemory`) + **Danger zone** (delete account) |
| `/delete-account` | `DeleteAccountPage` | **Public** (no auth guard, no shell): Play-required deletion URL; signs the user in, then deletes |
| `/plan/:day` | `PlanDayPage` | **Editable** day plan: reorder/add/remove exercises, drill-down rows, `Save changes` (`updatePlanDay`) + start CTA |
| `/plan/:day/exercise/:section/:index` | `ExerciseDetailPage` | Per-exercise: ExerciseDB demo/info, edit targets (reps/weight or time), swap/link via `FindAlternativeDialog`, remove |
| `/workout/:day` | `WorkoutSessionPage` | Guided set logging + timer → `logWorkout` |
| `/chat-history` | `ChatHistoryPage` | Past sessions (read-only transcripts). Open session is `?session=<id>`: two screens below `lg` (list → transcript, Back returns to list), side by side from `lg` |

`:day` accepts a backend day key (`monday`…`sunday`) or `today` (resolved to the current weekday).

## Screen conventions

- Read cross-screen data from the Zustand store; refresh in a `useEffect` guarded against stale
  updates. Don't hold duplicate copies of store data.
- **Home**: dashboard + health load must stay resilient and non-blocking (fall back to
  placeholder/CTA). Empty `active_workout_plan` → the "Ready to plan your workout?" CTA.
  The 5-day "Upcoming week" is a snap-scrolling row on mobile and a grid from `sm` up — a
  2-col grid left a ragged single-card last row.
  **This week** (`WeekActivityCard`, from the dashboard's `week_activities`) shows Mon–Sun with an
  aqua **tick** for a planned workout done and a separate blue **dot** per other activity (watch
  import from the mobile app, coach log, quick log) — never mix them, so the plan's completion stays
  truthful. Selecting a day lists its activities; a row opens `/activities/<id>`, "All activities" opens `/activities`.
  Upcoming cards carry the same "+N activity" marker. A quick log re-loads the dashboard.
- **Workout session**: the header carries the guided/list toggle and (when the day has
  `ai_notes`) an info button. The session note is a **dialog**, auto-opened once per
  plan+day via `forma:workout-note-seen` — it must not reappear above every exercise.
  This is an **immersive route**: `AppShell` hides all nav, so the header back button is the
  only exit and it goes through `ExitWorkoutDialog`. A sentinel `history.pushState` entry turns
  browser/system Back into that same dialog, and `beforeunload` covers reload/close. Confirming
  navigates to `/` (never `-1` — that lands back on the sentinel).
  **Per-side belongs on the number it qualifies**, not on a row of its own: the rep dial reads
  "Reps per side" (`reps/side` in the list view), the countdown reads "1:00 per side". A per-side
  timed hold runs the clock twice with a tap-to-continue **"Switch side"** stop in between, and
  logs both sides' seconds. The planned hold time is owned by `WorkoutGuided` (not the ring) so a
  ± adjustment carries across the block's sets and is what `logWorkout` receives.
  **Weight carries forward**: `setWeight` applies a set's new weight to later sets until it hits one
  that is completed or has `weightEdited` (the user dialled it themselves). Don't "simplify" it to
  "later sets still on the old value" — a held ± sweeps up a pyramid/drop set as it passes through
  that value. Reps deliberately don't carry (they're the outcome, not the plan).
  **Find an alternative** swaps a catalog-type block **for this session only** (`swapBlock`): the
  block key stays the plan's so the persisted signature still matches, swaps persist in
  `forma:workout-session` (`swaps`), not-done sets reset their weight (then pre-fill from
  `getLastPerformance`), and `swapped_from` is sent to `logWorkout`. The plan is never changed.
- **Profile / coach memory**: the `CoachMemory` card sits between Personalization and the save
  row and shows the AI's global memory — the same `user_memory` rows the backend pastes into the
  coach's system instruction — with edit / add / forget. It is deliberately **outside** the
  form's `Save changes`: each row saves itself through `PATCH`/`DELETE /profile/memory/{id}` the
  moment it is confirmed, because a half-saved memory list is worse than an immediate one. It
  owns its own `getUserMemory` fetch rather than reading the store — the cached profile is
  stale-while-revalidate, while memory changes on every chat-session rollover. Forgetting is a
  two-step inline confirm, not a modal, since it is a soft delete of one line.
- **Profile / delete account**: both entry points (the Danger zone card and the public page)
  render the same `DeleteAccountDialog` and go through `useAuth().deleteAccount`, which calls
  `DELETE /account` **first** and only then drops the local session — a failed request must
  leave the user signed in and able to retry. Deletion is immediate and irreversible
  server-side, so keep the type-`DELETE`-to-confirm step and keep both surfaces describing
  the same data (`DELETED_DATA`); Play requires the in-app flow and the web URL to agree.
- **Phone widths**: screens must fit a 320–390px portrait viewport with no horizontal scroll.
  Where two dials/steppers share a row (workout guided + list view, run capture), the number
  stacks above its ± buttons below `sm` — `107.5` or `12.5` inline with ± does not fit half a phone.
  Anything on a navy hero (Home, plan day) uses aqua controls, never a surface token (near-black in dark).
- **Coach**: consume the `streamChat` SSE helper; render incremental chunks; keep the
  stop/retry/new-session affordances and the "scroll to latest" button.
- **Fuel**: read the file as a base64 data URL and post to `logNutrition`. "Recent meals" loads
  persisted history via `getNutritionLogs` on mount and prepends new logs (survives refresh).
- **Progress**: `getProgress` returns level/XP, `this_week` activity stats (wired to the "This
  week" tiles), and `health_insights` (icons map the stable enum, falling back to `general`).
  The "Workouts this week" tile (and an "All activities →" link) navigate to `/activities`.
  The **Health trends** section is a `HealthTrendChart` (lazy-loaded so `recharts` is a separate
  chunk) fed by `getHealthLogs(token, 90)`; it plots two user-chosen dimensions over 7/14/30 days.
  It is **not** a dual-axis chart — both series are min–max normalized to a shared 0–100 scale
  (the tooltip shows the real captured values), avoiding the spurious-correlation trap of two
  independent y-scales.
- **Activities** (nav item between Fuel and Progress): one list for individual sessions; Progress
  keeps the trends. Rows are `ActivityRow` (watch / coach / quick log) and `WorkoutRow` (guided
  workout, "Planned workout" badge, avg bpm from a linked watch recording). Week headers come from
  the response's `weeks` (whole-week totals, so a week split across two pages still adds up).
  Paging is the server's opaque `next_cursor`; a short page with a cursor is normal, only `null` is
  the end. The `IntersectionObserver` root is the nearest scrolling ancestor (`AppShell`'s pane from
  `md` up), otherwise the preload margin never applies. Home's "This week" stays on the current
  week; browsing back happens here. Detail pages go **Back** through history (Home or the list),
  else to `/activities`. Zones come from the server (`seconds_in_zone`); `zone_model: null` with HR
  present → "Add your birth year to see heart-rate zones" → Profile. Coach and quick logs are
  editable (XP moves by the server's `xp_delta`); imports are read-only.
- **Progress / Your progress**: `ProgressSnapshotSection` renders `GET /progress` →
  `progress_snapshot` (store: `progressSnapshot`) — the web twin of the mobile section, same
  rules: strength → consistency → body → fitness; a `null` field means "not tracked" (render
  nothing, never nag); weight's headline is the 7-day average and the sparkline only shows once
  the backend returns a trend; body changes are colour-neutral. Entries come from
  `getBodyMeasurements` (90 days), sit collapsed behind "Show entries (N)", and include rows
  the **mobile app imported from Health Connect** — those show their source ("Fitdays",
  "Garmin Connect") and are **read-only** (the
  server 409s; the next sync would restore them). `manual`/`coach` rows open
  `BodyMeasurementDialog` in edit mode (PATCH, or delete with an inline confirm). Values are
  typed in the user's units and converted to canonical (kg/cm) in the dialog.
- **Profile / Body & heart rate**: birth year, height (cm, or ft + in for imperial), optional
  sex ("Prefer not to say" = `null`), max-HR override under "Advanced". All optional, saved with
  the form, never in onboarding. An untouched imperial height keeps the stored cm value.
- **Plan / Exercise detail**: edits go to a shared `planDraft` slice in the Zustand store (both
  `/plan/:day` and the exercise route read/write it), not straight to the backend. `PlanDayPage`
  seeds the draft from `getWorkoutPlan` (without clobbering unsaved edits) and is the **only**
  place that persists — one `updatePlanDay` PATCH on `Save changes`, then `markPlanSaved`. On PATCH
  the backend fuzzy-matches any `name`-without-`exercise_id` and stamps the canonical id, so a
  manually typed exercise self-links on save; the detail page's search just lets the user pick the
  exact match instead. `main` section ↔ the plan's `exercises` array.
  Swaps from a day row (shuffle button) and from the detail page both open `FindAlternativeDialog`
  and write through `swapPlanExercise` as ordinary draft edits (saved with `Save changes`). Below
  `sm` the row's target text sits under the name, leaving room for the swap button.

## UI & branding

- Use the design-system primitives from `src/components/ui.tsx` and the `AppShell` layout.
- Use brand tokens (CSS vars + `forma.*` Tailwind colors), not hardcoded hex.
- Keep light/dark consistent via `useAppTheme()`; screens read tokens that flip automatically.
- Section eyebrows are UPPERCASE with wide tracking; numbers/metrics are big and extrabold
  (use the `.tabular` class for tabular figures).
