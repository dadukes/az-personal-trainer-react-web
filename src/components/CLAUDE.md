# src/components/ — design system & shell

Scoped guidance for shared UI. See the root [CLAUDE.md](../../CLAUDE.md) for project-wide rules.

## What lives here

- **`ui.tsx`** — the design-system primitives. Forma Signal: `Surface`, `Stat`, `Button`, `Row`,
  `Sheet`, `Segmented`, `StatusTick`. Older ones that screens move off as they're redesigned:
  `Card`, `StatTile`, `Input`, `Chip`, `Badge`, `Avatar`, `ProgressBar`, `ChatBubble`, `Eyebrow`.
- **`AppShell.tsx`** — the responsive app frame: **sidebar (≥1024) → icon rail (768–1023) →
  bottom tab bar (<768)**, plus the footer user block, theme toggle, and sign-out. Routes matching
  `isImmersiveRoute` (today: `/workout/*`) render **with all three nav surfaces hidden** — a
  mis-tap mid-set costs the user their session — so those screens own the bottom edge and must
  place their own sticky bars at `bottom-0` (+ `env(safe-area-inset-bottom)`), not above `74px`.
- **`ScreenHeader.tsx`** — title + subtitle + optional right actions.
- **`QuickActionsFab.tsx`** — the floating "+" that fans out into Home's manual-capture
  actions (log workout / log health data / add measurement). It is the **single** entry point for those dialogs;
  don't add competing "Log" buttons to the header or the snapshot card.
- **`UserMenu.tsx`** — avatar button + dropdown (edit profile, theme toggle, sign out). Primarily
  the mobile account entry point (`md:hidden` in Home's `ScreenHeader`), since the sidebar/rail
  are hidden `<768`. Desktop keeps the sidebar footer + rail (Settings icon → `/profile`).
- **`DeleteAccountDialog.tsx`** — the type-`DELETE`-to-confirm modal for the irreversible account
  wipe, plus `DELETED_DATA`, the shared wording for what deletion removes. Used by **both** the
  Profile Danger zone and the public `/delete-account` page — Google Play requires the in-app
  flow and the web deletion URL to describe the same thing, so keep the list in this one place.
- **`CoachMemory.tsx`** — the "What your coach remembers" card on `/profile`. The one exception
  to "data-fetching belongs in pages": it owns its own `getUserMemory` load and per-row
  `PATCH`/`DELETE`, because memory changes independently of the cached profile and each row
  saves on its own rather than joining the profile form's submit.
- **`NumberEntry.tsx`** — typed entry for stepper values. `NumberEntry` is the number itself as a
  text field (dashed underline = tappable): edits a string draft while focused so "12," survives,
  commits on blur/Enter, Escape or an empty field reverts. `DurationEntry` shows "32:45"/"1:05:30"
  and opens an h/min/sec sheet (a numeric keypad has no ":"). Input font must stay **≥16px** or
  iOS zooms on focus. The sheet is portalled.
- **`HoldTimer.tsx`** — the logbook's timed hold: `useHoldTimer` (clock, beeps, finish), `HoldScreen` (full screen, portalled; Escape puts it away) and `HoldBar` (the slim bar, drawn in both the footer and the side panel). Mobile twin: `workout/logbook/hold-timer`.
- **`FindAlternativeDialog.tsx`** — "Find an alternative": the coach's `alternatives` first when the
  caller passes them (rendered at once from plan data, pictures filled in by `getExercisesBatch`), then
  suggestions on open (`GET /exercises/{id}/alternatives`; an unlinked exercise first borrows its nearest name match's
  id, which is offered too) plus a search with a "use as typed" escape hatch. Returns an
  `ExercisePick`; the caller decides what a pick means (session swap vs plan draft edit). Like
  `CoachMemory` it owns its fetching. Full-screen below `sm` (a bottom sheet sits under the
  keyboard once search is focused), centred dialog above; portalled; search is not auto-focused.
- **`ProgressSnapshotSection.tsx`** — "Your progress" on `/progress` (strength, consistency,
  body, fitness) from `progress_snapshot`, plus the body entries list, **collapsed** by default
  behind "Show entries (N)" (the card leads with the weight trend and tiles). Presentational;
  the page owns fetching. Mirrors the mobile `progress-snapshot-section`.
- **`BodyMeasurementDialog.tsx`** — add or edit one body measurement (metric chips, value in the
  user's units, date, note; delete in edit mode). Presentational like `HealthCaptureDialog`.
  The web adds **editing**, which mobile doesn't have yet; device-imported rows never open it.
- **`ActivityRow.tsx` / `ZoneBar.tsx` / `WeekActivityCard.tsx`** — activities outside guided
  workouts (web twins of the mobile `activity-row`, `zone-bar`, `week-activity-card`). Labels come
  from `src/lib/activities.ts`; zone colours are the `--zone-1…5` tokens. Presentational.
- **`WorkoutRow.tsx` / `HeartRateCard.tsx` / `ActivityEditDialog.tsx` / `DetailHeader.tsx`** — the
  Activities tab: a guided workout's list row; the detail pages' heart-rate section (avg/max, zone
  bar, per-zone table with bpm ranges from `zone_model.floors`, or the birth-year prompt); the edit
  dialog for coach/quick logs (presentational, like `BodyMeasurementDialog`); and the detail pages'
  back + title header (`useBackToActivities`). Mobile twins: `workout-row`, `heart-rate-card`,
  `activity-edit-sheet`, `detail-header`.
- **`WorkoutExerciseDialog.tsx`** — edit one exercise of a logged workout after the fact: tick sets,
  reps / weight / time, add or remove sets; a not-logged exercise is seeded from the plan, ticked.
  Presentational (the page owns the call); rules in `src/lib/workoutEdit.ts`, kept identical to the
  mobile `lib/workout-edit.ts`. Mobile twin: `workout-exercise-sheet`.
- **`WorkoutStatus.tsx`** — `WorkoutSyncHost` (runs the save queue, mounted once with the shell) plus Home's `WorkoutResumeCard` and `PendingWorkoutsCard`. Mobile twins: `workout-sync-host`, `workout/home-workout-status`.
- **`GeneralHeartRateCard.tsx`** — "General HR data" on a guided workout the watch didn't record
  (`general_heart_rate`, sent by the phone): avg bpm and the smoothed all-day curve on
  `HeartRateChart` with `zoneModel={null}` (no bands). Deliberately no max, zones or XP — the
  background readings are too sparse. Title in mixed case, not an uppercase `Eyebrow`. Mobile twin:
  `general-heart-rate-card`.
- **`HeartRateChart.tsx`** — bpm over elapsed time from `hr_curve` (recharts), zones as faint bands
  when a zone model exists, a workout's recordings on one axis with a gap between them. Lazy-loaded
  by `HeartRateCard` so recharts stays its own chunk. Mobile twin: `heart-rate-chart` (react-native-svg).
- **`ChatMarkdown.tsx`** — dependency-free, HTML-escaping markdown renderer for coach messages
  (headings, bold/italic, inline + fenced code, links, lists). Styled via `.md-body` in `index.css`.
- **`TypingDots.tsx`** — the streaming/"thinking" indicator.
- **`SuggestionCard.tsx`** — a coach plan suggestion under its message (boards `WebCoachPlan`, `CoachDay`,
  `Coach`): a week table (stacked below `sm`), one day's exercises with what was taken out, or a single
  exercise's before and after; then Accept, or the saved state with "See plan", or the grey "Replaced by
  your tweak" line. Presentational: the page owns accepting. Mobile twin: `coach-suggestion-card`.

## Rules

- **Theme via CSS variables, not props.** Components read semantic tokens (`--accent`,
  `--bg-surface`, `--text-primary`, `--border-base`, …) so light/dark flip automatically with
  no per-component branching. Add new tokens to `src/index.css` (both `:root` and `[data-theme="dark"]`).
- Match Forma Signal: radius is 12 control, 16 button, 20 surface, 24 hero (`rounded-control` and
  so on), with pills (`999px`) for chips/avatars/FABs. New screens use one `Surface` level: depth by
  tone, no outlines, no box inside a box, and lists as one Surface of `Row`s. Type comes from the
  `type-*` classes in `index.css`.
- Buttons: primary = **aqua fill + navy label**, for the one main action; strong = navy; quiet =
  tonal; link = teal text. Press **scales down** (`active:scale-*`) rather than shifting color.
  Selected states use the `--tint` fill.
- **Aqua is a fill, never text on a light ground.** Text and icons use `--teal`, but not on
  `--sunken` in light mode (4.4:1). Pairs that must stay readable are in `src/lib/designTokens.test.ts`.
- Icons are **lucide-react** at brand stroke weight (`2` default; `2.2–2.5` for active nav).
  Don't hand-draw icons or swap icon sets.
- Keep primitives presentational and stateless where possible; data-fetching belongs in pages.
- **Anything on the selected fill (`--bg-selected`) reads from the `--text-on-mint*` tokens**, which
  stay readable on the tint in both themes. Content on the hero uses `--hero-ink` and `--hero-sub`.
- **Mobile (<768) scrolls the document, not an inner element** — that is what makes the browser
  auto-hide its URL bar. `AppShell` only becomes a fixed `100dvh` frame with its own scroll
  region from `md` up. Use `dvh`, never `vh`, and offset fixed bottom bars by
  `calc(74px + env(safe-area-inset-bottom))`.
- `ChatMarkdown` must keep escaping HTML before formatting — it renders backend/LLM text via
  `dangerouslySetInnerHTML`, so never interpolate raw model output without escaping.
