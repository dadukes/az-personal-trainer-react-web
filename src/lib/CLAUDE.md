# src/lib/ — API, env, Supabase, health

Scoped guidance for the data/integration layer. See the root [CLAUDE.md](../../CLAUDE.md)
for project-wide rules.

## api.ts — backend client

- **All** network calls live here. Do not add `fetch` clients in pages or components.
- Every request sends both auth layers via the shared `apiFetch` helper:
  - `Authorization: Bearer <accessToken>`
  - `x-functions-key: <env.azureFunctionKey>`
  - `Content-Type: application/json`
- Gate on `env.hasApiConfig` before calling out; throw the existing descriptive "missing env"
  error rather than failing silently.
- `resolveApiBaseUrl` only strips a trailing slash — **do not re-add the Android `10.0.2.2`
  remap** from the mobile app; the browser reaches `localhost` directly.
- Exported types (`UserProfileData`, `DashboardResponse`, `ProgressResponse`, …) mirror the
  Azure Functions backend (sibling repo `../az-ai-personal-trainer`, documented in
  `../ai-personal-trainer-expo-ui/API_docs.md`). The **backend is the source of truth** —
  keep these in sync with the handlers.
- **Chat is SSE**, not JSON. `streamChat` opens `POST /chat`, parses `event:`/`data:` blocks,
  and tolerates: missing event names (infers type from payload shape), non-JSON data lines
  (treats as a text chunk), and a no-`reader` full-text fallback. Preserve this resilience and
  the `AbortController` cleanup returned to the caller. Verified event order from the live
  backend: `status(started) → status(generating) → chunk… → done`.
- `logWorkout` falls back to `POST /activity/log` when `/workouts/log` errors, so XP still awards.
- The former contract gaps (writable `primary_goal`, `this_week` stats, `nutrition/logs` history,
  stable insight-icon enum, dashboard `completed_days`) are now backed and wired — see the
  resolved items in [../../backend-gaps.md](../../backend-gaps.md).

## env.ts

- Only `import.meta.env.VITE_*` vars are readable in the browser bundle. Add new config here
  with a safe default and extend `hasApiConfig` / `hasSupabaseConfig` / `getMissingEnvVars`.
- Types for the vars live in `src/vite-env.d.ts` — update both together.

## supabase.ts

- Single `supabase` client; session persists in `localStorage` (`autoRefreshToken` on,
  `detectSessionInUrl` on for email-confirmation redirects). Don't create additional clients.
- Tokens expire (~1h) and auto-refresh — always read the **current** `session.access_token`
  when calling the API (via `useAuth()`); don't cache it long-term.

## health.ts — health adapter (web)

- Browsers have **no** Health Connect / Apple Health API, so `readTodayHealthData()` **always**
  returns realistic mock data (mirroring the mobile app's Expo-Go fallback) and
  `isNativeHealthAvailable()` returns `false` (drives the "(MOCK)" badge on Home).
- The user can **manually capture** today's metrics from Home (`HealthCaptureDialog` →
  `syncHealth`). `load`/`saveManualCapture` keep the latest capture per-user in `localStorage`
  so reopening the dialog the same day prefills the previous entry, and a same-day capture
  beats the mock in the Home snapshot. The backend has no read endpoint for health logs
  (backend-gaps.md #7), so this prefill is device-local.
- If a real web/wearable health integration is added later, implement it here and make
  `isNativeHealthAvailable()` report accurately — keep the mock as the fallback.
