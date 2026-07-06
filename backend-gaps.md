# Backend gaps & contract notes

Places where the **web UI (and the design)** wants data or behavior the **Azure Functions
backend** (`../az-ai-personal-trainer`, contract in `../ai-personal-trainer-expo-ui/API_docs.md`)
does not currently provide. Captured so we don't lose the context; each item notes the current
web-side workaround and what a backend fix would enable.

Status legend: 🟡 UI shows placeholder/illustrative data · 🔵 UI collects data that is dropped ·
🟢 aligned, just an alignment note.

---

## 1. 🔵 `primary_goal` is not writable on the profile

**Endpoint:** `PUT` / `PATCH /api/profile`

The onboarding "What's your goal?" step (Lose weight / Build strength / Improve endurance /
Reduce stress) maps to `primary_goal`. But `primary_goal` appears **only in responses**
(`UserProfileData`) — it is **not** in the accepted update fields. The documented writable set is:
`coach_personality`, `fitness_level`, `preferred_duration_minutes`, `fears`, `available_days`,
`display_name`, `limitations`, `equipment_available`.

- **Current web behavior:** the goal is collected for UX and shown in the review summary, but
  **not sent** to the backend (to avoid an unknown-field request). It is effectively discarded.
- **Fix:** accept `primary_goal` (enum `weight_loss | muscle_gain | general_fitness | endurance |
  flexibility | stress_relief`) on profile update, then have `OnboardingPage` include it in the
  `updateProfile` payload (the field already exists on `ProfilePayload` in `src/lib/api.ts`).

## 2. 🟡 No "this week" / activity-stats endpoint

**Endpoint:** `GET /api/progress` returns only `current_level`, `current_xp`,
`xp_to_next_level`, and `health_insights[]`.

The Progress screen's **"This week"** card (design) shows *Consistency streak*, *Workouts this
week*, *Minutes trained* — none of which have a data source.

- **Current web behavior:** `ProgressPage` renders these three tiles with **static illustrative
  values** (`12 days`, `4`, `128m`).
- **Fix:** add a stats block to `GET /api/progress` (or a `GET /api/stats/weekly`) exposing
  streak, workout count, and minutes trained, then wire the tiles to it.

## 3. 🟡 No meal-history (GET) endpoint

**Endpoint:** `POST /api/nutrition/log` logs a meal and returns the analysis, but there is **no
GET** to list previously logged meals.

The Fuel screen's **"Recent meals"** list (design) needs a meal history.

- **Current web behavior:** `FuelPage` keeps a **session-local** list — only meals logged in the
  current browser session appear; a refresh clears it.
- **Fix:** add `GET /api/nutrition/logs?limit&offset` (recent meals with description / calories /
  timestamp), then load it on mount and prepend new logs.

## 4. 🟡 Health-insight `icon` values are open-ended / undocumented

**Endpoint:** `GET /api/progress` → `health_insights[].icon`

Observed from the **live local backend**, insights came back with `icon: "workout"` and
`icon: "stress"`. Neither is in the icon set the UI (or the mobile app) maps
(`heart_pulse`, `moon`, `trophy`, `zap`, `trending_up`).

- **Current web behavior:** unknown icon names fall back to the `Zap` glyph, so insights render
  but with a generic icon.
- **Fix:** either (a) constrain the backend to a **documented, stable icon enum**, or (b) expand
  the frontend `ICON_MAP` in `src/pages/ProgressPage.tsx` (and the mobile app) to cover
  `workout`, `stress`, etc. Preferably (a) so both clients stay in sync.

## 5. 🟢 Onboarding "days per week" is coerced to `available_days`

The design's Step 2 collects a training **rhythm** as *3 / 4 / 5 days*. The backend field is
`available_days` (an array of day **names**, e.g. `["monday","wednesday","friday"]`).

- **Current web behavior:** `OnboardingPage` maps the chosen count to a fixed weekday spread
  (`3 → Mon/Wed/Fri`, `4 → Mon/Tue/Thu/Sat`, `5 → Mon–Fri`) and sends that as `available_days`.
- **Note / optional fix:** if specific-day selection matters, add a day-picker to onboarding and
  send the actual chosen days instead of a synthesized spread. Not blocking — just a fidelity gap.

---

## Not gaps (verified working against the local backend)

- `POST /api/chat` **SSE** streams `status → status(generating) → chunk… → done` — parsed by
  `streamChat`. ✅
- `GET /api/profile`, `GET /api/dashboard`, `GET /api/progress` return `200` with real data. ✅
- `POST /api/workouts/log` **is** registered, so `logWorkout`'s primary path works;
  the `POST /api/activity/log` fallback in `logWorkout` is just belt-and-suspenders. ✅
- CORS: the backend's `local.settings.json` has `Host.CORS: "*"`, so the browser origin
  (`http://localhost:5173`) is allowed with no changes. ✅
