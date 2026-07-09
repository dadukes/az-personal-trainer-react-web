# Backend gaps & contract notes

Places where the **web UI (and the design)** wanted data or behavior the **Azure Functions
backend** (`../az-ai-personal-trainer`, contract in `API_docs.md`) did not originally provide.
Kept so we don't lose the context; each item notes the current web-side behavior.

Status legend: ✅ resolved (backend now provides it, frontend wired) · 🟡 UI shows
placeholder/illustrative data · 🔵 UI collects data that is dropped · 🟢 aligned, alignment note.

> **2026-07 update:** the backend shipped endpoints/fields covering gaps 1–4 and 6, and the
> frontend has been aligned (see `git log` around this note). Gap 5 (day-picker) is also now done.
> All responses were verified against the deployed backend and match this contract.

---

## 1. ✅ `primary_goal` is now writable on the profile

**Endpoint:** `PUT` / `PATCH /api/profile`

`primary_goal` is accepted on profile update (enum `weight_loss | muscle_gain | general_fitness |
endurance | flexibility | stress_relief`).

- **Web behavior:** `OnboardingPage` sends the chosen goal as `primary_goal` in the `updateProfile`
  payload; `getProfile` reads it back into the store (`AuthProvider`).

## 2. ✅ Weekly activity stats on `GET /api/progress`

`GET /api/progress` now returns a `this_week` block: `consistency_streak_days`,
`workouts_this_week`, `minutes_trained_this_week` (all in the user's timezone, `0` for new users).

- **Web behavior:** `ProgressPage`'s "This week" tiles read `data.this_week` (falling back to `--`
  while loading), replacing the old static `12 days / 4 / 128m` placeholders.

## 3. ✅ Meal-history endpoint `GET /api/nutrition/logs`

`GET /api/nutrition/logs?limit&offset` lists recently logged meals (most-recent first).

- **Web behavior:** `FuelPage` loads history on mount via `getNutritionLogs` and prepends new logs,
  so "Recent meals" survives refreshes and syncs across devices (no longer session-local).

## 4. ✅ Health-insight `icon` is a stable enum

`GET /api/progress` → `health_insights[].icon` is one of a documented, server-coerced set:
`heart_pulse · sleep · steps · stress · energy · calories · workout · trophy · trending_up ·
general`.

- **Web behavior:** `ProgressPage`'s `ICON_MAP` maps exactly this set and falls back to `general`
  for any unexpected value.

## 5. ✅ Onboarding sends the user's actual chosen days

`available_days` is the documented source of truth for training rhythm (array of lowercase day
names).

- **Web behavior:** `OnboardingPage`'s Step 2 is now a **weekday picker** (Mon–Sun chips); the
  selected days are sent in canonical order as `available_days`, replacing the old
  count → fixed-spread synthesis.

## 6. ✅ Authoritative workout completion in the dashboard

`GET /api/dashboard` → `data.completed_days` maps each completed weekday of the current
(Monday-start) week to `{ session_id, completed_at }`, matched by the active `plan_id`.

- **Web behavior:** `HomePage` resolves each server weekday to its current-week date
  (`currentWeekDateForDayKey`) and treats those as authoritative for the "Completed 💪" badge and
  week-view watermark. The local `completedWorkouts` mirror (`localStorage`) is kept only as an
  **optimistic overlay** so the badge appears instantly after finishing, before the next dashboard
  refresh confirms it cross-device.

## 7. 🟡 No read endpoint for health logs

**Endpoint (missing):** something like `GET /api/health/today` (or `/health/logs?date=`).

`POST /api/health/sync` accepts a manual capture (sleep, HR, steps, calories, quality/energy,
notes — upserted by `logged_date`), but there is no endpoint to read a day's log back.

- **Web behavior:** the Home "Log / Update" health-capture dialog persists the latest capture
  per-user in `localStorage` (`forma:manual-health:<userId>`, see `src/lib/health.ts`) so
  reopening it the same day prefills the previous entry for editing, and the snapshot tiles show
  the captured values instead of mock. This prefill/display is therefore **device-local** — a
  capture made on another browser won't show up until a read endpoint exists.

---

## Not gaps (verified working against the local backend)

- `POST /api/chat` **SSE** streams `status → status(generating) → chunk… → done` — parsed by
  `streamChat`. ✅
- `GET /api/profile`, `GET /api/dashboard`, `GET /api/progress` return `200` with real data. ✅
- `POST /api/workouts/log` **is** registered, so `logWorkout`'s primary path works;
  the `POST /api/activity/log` fallback in `logWorkout` is just belt-and-suspenders. ✅
- CORS: the **local** backend's `local.settings.json` has `Host.CORS: "*"`, so the dev origin
  (`http://localhost:5173`) is allowed with no changes. ✅ The **deployed** Azure Functions app
  now also allows `http://localhost:5173` (added 2026-07), so the dev server can be pointed at the
  deployed API and driven in a real browser. Verified end-to-end against prod data — see the
  browser-test note around this commit.
