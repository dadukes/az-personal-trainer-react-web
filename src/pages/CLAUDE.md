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
| `/login` | `LoginPage` | Always navy (board `Welcome`): tagline, email and password, Sign in, "New here? Create an account"; keeps the delete-account link |
| `/onboarding` | `OnboardingPage` | 3 steps (board `Onboarding`): name and coach voice; goal, level and session length; days and what gets in the way. Sends only backend-accepted profile fields |
| `/` | `HomePage` | Today's job first, then the week strip, health in one row and Recent (Phase 8A); every manual-capture dialog hangs off the `QuickActionsFab` |
| `/coach` | `CoachPage` | SSE chat (board `Coach`): plain coach text under the Forma mark, navy bubbles for the user, pill quick replies, rounded composer; desktop context panel from `xl` |
| `/fuel` | `FuelPage` | Eaten today against Burned so far (`lib/fuel.ts`), meal photo (camera or library on a phone, drag and drop on desktop) → `logNutrition`, today's meals |
| `/progress` | `ProgressPage` | Level bar, Strength, Consistency with the 28-day grid (`lib/progress.ts` over `/history`), Body, Fitness, Health trends, real coach insights only |
| `/activities` | `ActivitiesPage` | This week's sessions, time and distance up top; every session newest first from `GET /history`, cursor-paged, one Surface of rows per Mon–Sun week (`groupByWeek`) with older weeks' totals; workouts show ticked sets (`done_sets`) |
| `/activities/:id` | `ActivityDetailPage` | One activity (`getActivity`): stats (duration, distance, pace/speed, a ride's max speed, calories, elevation, XP — only what the device shared, in `DetailHeader`'s `StatGrid`), `HeartRateCard` with the `hr_curve` chart, note. **Edit** for coach/quick logs (`ActivityEditDialog`); imports are read-only |
| `/activities/workout/:id` | `WorkoutDetailPage` | One guided workout (`getWorkoutSession`): plan-day title, duration/sets/volume/calories/elevation/XP, watch HR combined across its recordings with one chart (`HeartRateCard`) — or, with no recording, the phone-sent all-day readings as "General HR data" (`GeneralHeartRateCard`: avg + smoothed curve, no max/zones/XP) — every exercise by section from the server's `exercises` (plan day merged with the logs: `logged` set pills, `done` without sets — "Recorded on your watch" / "logged with your coach" — and dashed `not_logged` cards). **Edit, or clicking an exercise, opens the logbook in Edit mode** (`/workout/edit/:id`) |
| `/progress/workouts`, `/progress/workouts/:id` | redirects | Old links → `/activities`, `/activities/workout/:id` |
| `/profile` | `ProfilePage` | Edit onboarding/profile data (`updateProfile` PUT → `applyProfileUpdate`) incl. the optional **Body & heart rate** fields + **coach memory** (`CoachMemory`) + **Danger zone** (delete account) |
| `/delete-account` | `DeleteAccountPage` | **Public** (no auth guard, no shell): Play-required deletion URL; signs the user in, then deletes |
| `/plan/:day` | `PlanDayPage` | Reads by default (name, coach note, sections, Start). **Edit** brings move buttons, swaps, Add and `Save changes` (`updatePlanDay`); Done with unsaved changes asks to discard |
| `/plan/:day/exercise/:section/:index` | `ExerciseDetailPage` | Per-exercise: ExerciseDB demo/info, edit targets (reps/weight or time), swap/link via `FindAlternativeDialog`, remove |
| `/workout/:day` | `WorkoutSessionPage` | Loads the day or the workout in progress and opens the logbook → the save queue (`workoutSync.ts`) |
| `/workout/log` | `WorkoutLogPage` | The logbook in Log mode (`?date=YYYY-MM-DD`, `&day=` a plan day or `none`): a finished workout, saved through the same queue |
| `/workout/edit/:id` | `WorkoutEditPage` | The logbook in Edit mode: the whole workout saved with `PUT /workouts/sessions/{id}`, or deleted |
| `/chat-history` | `ChatHistoryPage` | Past sessions (read-only transcripts). Open session is `?session=<id>`: two screens below `lg` (list → transcript, Back returns to list), side by side from `lg` |

`:day` accepts a backend day key (`monday`…`sunday`) or `today` (resolved to the current weekday).

## Screen conventions

- Read cross-screen data from the Zustand store; refresh in a `useEffect` guarded against stale
  updates. Don't hold duplicate copies of store data.
- **Home** (Phase 8A, boards `Main`, `HomeDark`, `HomeRest`): a date and greeting, then today's job first. Logic in `src/lib/home.ts`, kept identical to mobile's `lib/home.ts`.
  **Today** is one card: Resume when a workout is in progress; else the navy hero with the day's name (`splitFocus` turns "Upper Body B (Incline Press & Back Sculpt)" into a title and a line), length and count, the coach's note, a labelled **Start workout**, View plan and "Already did it? Log it"; a **Done today** card (time, minutes and XP from today's `GET /history` row; no set count, since `total_sets` counts unticked sets) with View or edit and Log another; a **Rest day** card with "Next up"; or, with no plan, an invite to plan with the coach.
  **This week** is one Mon–Sun strip of `StatusTick`s with a separate sky dot for activity outside the plan (watch import, coach log, quick log), never mixed with the plan's tick, and "N of M workouts". A day opens its plan day; the latest missed plan day offers "Did it? Log it".
  **Health** is one row with only the numbers captured today, else an invite to enter them. **Recent** lists the newest three sessions from `GET /history`. The page still sets the store's `weekPlan` (`buildWeekPlan`) for Coach's side panel. A quick log re-loads the dashboard and Recent.
  Desktop is a single 680 px column until Phase 9's two-column Home.
- **Workout draft**: every change is stored (`workoutSync.ts`), and the page reopens a workout in progress from that alone, so it needs neither the plan nor a network, and a plan changed since can't throw it away. Home shows **Resume workout** in place of today's start, plus anything still waiting to sync (`WorkoutStatus.tsx`). Opening a different day asks first. While that question is open, nothing may be written from the day on screen, or it would replace the workout being resumed.
- **Workout session**: an **immersive route**. `AppShell` hides all nav, so the logbook's X is the
  only exit and it asks first. A sentinel `history.pushState` entry turns browser/system Back into
  that same question, and `beforeunload` covers reload/close. Leaving goes to `/` (never `-1`, which
  lands back on the sentinel). The day's `ai_notes` open once per plan+day as a dialog
  (`forma:workout-note-seen`), never above every exercise. The old guided/list screen,
  `WorkoutGuided` and `WorkoutExerciseDialog` were removed with the flag on 2026-11-05;
  `ExerciseDemo` now has its own file.
  **Find an alternative** in a workout swaps the exercise **for this session only**: the block key
  stays the plan's, not-done sets reset their weight (then pre-fill from `getLastPerformance`), and
  `swapped_from` is sent to `logWorkout`. The plan is never changed.
- **Logbook** (`src/components/LogbookView.tsx`): `WorkoutSessionPage` loads the workout, writes the draft and guards leaving, then shows the logbook. From `lg` every exercise is open, with inputs in Tab order and the clock in a side panel. Below that it works like the phone: one exercise open, and a footer. `src/lib/logbook.ts` is the logic, mirrored on mobile.
  A blank weight is 0, shows "Add" and logs as no load, as there's no bodyweight type. A typed weight carries down (`carryWeight`) under the same rule as the old view. A per-side hold stores one side's seconds, and `toLogbookExercises` doubles it for the save. A rest starts only from a single-set tick, and not on the workout's last set. Preferences are on the account (`WorkoutPrefsCard` on Profile), and never-chosen means off.
- **Log and Edit** (`past` on `LogbookView`, pages `WorkoutLogPage` / `WorkoutEditPage`): the same page with no clock, rest or timers, the date and times at the top (`LogbookPast.tsx`), and Save in the footer or side panel. The page owns the exercises and times; `LogbookView` owns saving. Nothing is stored until Save, so there's no sentinel history entry: the X asks first once something changed, and `beforeunload` covers reload. Edit leaves with `-1`, or to the workout's page when opened directly or from a summary's "Fix something" (`state.fromSummary`). Rules in `src/lib/logbookPast.ts`, mirrored on mobile. The workout page's exercises open Edit.
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
  **Plan suggestions** (`SuggestionCard`, logic in `src/lib/planSuggestion.ts`, mirrored on mobile): the
  `suggestion` event puts a card on the coach's reply and marks the cards it `replaces`; history brings
  them back in their current state. Nothing is saved until Accept (`acceptPlanSuggestion`), which then
  refreshes the store's `weekPlan` (`buildWeekPlan`, shared with Home). A 409 `replaced` collapses the card;
  any other refusal shows on it. While the latest card is pending, the quick replies become tweaks and the
  box reads "Tell me what to change". Coach also loads `weekPlan` itself when the store is empty, for the
  side panel. Past chats show one line per card (`historyLine`).
  **Waiting and resuming** (phase 7.1, logic in `src/lib/chatTurn.ts`, mirrored on mobile): each message gets a
  `clientMessageId`. While the coach works, `CoachWaiting` shows the stream's progress label (thought headings,
  tool steps), with a "still going" line after 12 s on one label, and `PlanCardPlaceholder` shows once a plan tool
  starts. When the stream breaks after the server may have it, goes quiet for 40 s (checked on a timer and when
  the tab returns), or the page loads mid-turn, Coach follows the turn with `getChatTurn` every 3 s and reloads the
  session when it's done, so cards and replaced states are exact. Leaving Coach stops listening; coming back
  follows the turn. Retry reuses the id unless the turn failed. The coach's avatar is the Forma mark.
- **Fuel**: read the file as a base64 data URL and post to `logNutrition`. Meals load from
  `getNutritionLogs`; Eaten sums today's, and a new log is prepended. Burned so far needs height,
  birth year and sex in the profile plus a weigh-in, or it isn't shown.
- **Progress** (phase 8B): see the route table. `HealthTrendChart` is plain SVG now: one metric
  at a time, chips only for metrics with data in the last 30 days, and the whole card hides when
  there are none. The "This week" tiles and the placeholder insights are gone.
- **Activities** (nav item between Fuel and Progress): one list for individual sessions; Progress
  keeps the trends. Rows are the `Row` primitive: a tick tile for workouts, the activity's icon for the rest. Week headers come from
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
  and write through `swapPlanExercise` as ordinary draft edits (saved with `Save changes`). A real
  swap drops the old exercise's cues and notes for good. Taking a coach alternative moves the old exercise onto the list in its place; any other swap clears the list.
  In a workout the swap is for today only: the block keeps the list, and `sessionCoachAlternatives`
  adds the planned exercise once it has been swapped away. Below
  `sm` the row's target text sits under the name, leaving room for the swap button.

## UI & branding

- Use the design-system primitives from `src/components/ui.tsx` and the `AppShell` layout.
- Use brand tokens (CSS vars + `forma.*` Tailwind colors), not hardcoded hex.
- Keep light/dark consistent via `useAppTheme()`; screens read tokens that flip automatically.
- Section eyebrows are UPPERCASE with wide tracking; numbers/metrics are big and extrabold
  (use the `.tabular` class for tabular figures).
