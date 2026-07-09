# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Forma Fitness (Web)** — a **web-only React + Vite + TypeScript** build of the Forma
Fitness AI personal trainer. It is a port of the Expo/React Native app
(sibling repo `../ai-personal-trainer-expo-ui`) to the browser, built to match the
Claude Design **"Forma Web App Prototype"**. It talks to the **same Azure Functions
backend** and **Supabase Auth** as the mobile app.

Core user journey: **auth → onboarding → tabs** (Home, Coach, Fuel, Progress), plus
plan-day view, guided workout session, and chat history.

> Tagline is exact: **"Fitness that fits you."** (keep the period). App name
> **Forma Fitness** (full) / **Forma** (short).

## Always-on rules

- Maintain the existing architecture; avoid broad refactors unless explicitly asked.
- Keep TypeScript **strict**; do not introduce `any`. Type props, API payloads, and store data.
- Import project modules with the `@/` alias (maps to `src/` — see `tsconfig.json` + `vite.config.ts`).
- Functional components and hooks only.
- Do not bypass the centralized helpers:
  - **All backend calls** go through [src/lib/api.ts](src/lib/api.ts).
  - **Auth/session lifecycle** is owned solely by [src/providers/AuthProvider.tsx](src/providers/AuthProvider.tsx).
  - **Cross-screen app state** is the Zustand store in [src/store/useAppStore.ts](src/store/useAppStore.ts).
  - **Theme (light/dark)** is owned by [src/providers/ThemeProvider.tsx](src/providers/ThemeProvider.tsx).
- Keep error handling user-safe: critical actions surface a clear message; background
  refreshes may fail silently and fall back to cached/placeholder UI.
- Guard async work in effects against stale updates (`mounted`/`active` flag or `AbortController`).
- **Use brand tokens, not hardcoded hex.** Semantic CSS vars (`--accent`, `--bg-surface`,
  `--text-primary`, …) live in [src/index.css](src/index.css); the `forma.*` Tailwind
  colors live in `tailwind.config.js`. Both mirror the design system's `tokens/colors.css`.

## Tech stack

- **Vite 6** + **React 19** + **TypeScript** (strict)
- **React Router 7** (routing + auth guard in `src/App.tsx`)
- **Supabase Auth** (`@supabase/supabase-js`) — session persisted in `localStorage`
- **Zustand** state, **Tailwind CSS 3** styling, **lucide-react** icons

## Project layout

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Router + the single auth guard (`RequireAuth`). Keep redirect logic here. |
| `src/main.tsx` | Provider tree: `ThemeProvider → BrowserRouter → AuthProvider → App`. |
| `src/lib/` | API client, env, Supabase client, health adapter. See [src/lib/CLAUDE.md](src/lib/CLAUDE.md). |
| `src/store/` | Zustand store (single source of truth for cross-screen data). |
| `src/providers/` | `AuthProvider` (session + onboarding), `ThemeProvider` (light/dark). |
| `src/components/` | Design-system primitives + shell. See [src/components/CLAUDE.md](src/components/CLAUDE.md). |
| `src/pages/` | One file per screen. See [src/pages/CLAUDE.md](src/pages/CLAUDE.md). |
| `src/index.css` | Tailwind entry + CSS design tokens (light/dark) + markdown/chat styles. |
| `public/forma_logo.png` | Brand mark (from the design system). |

## Commands

```bash
npm run dev         # Vite dev server (http://localhost:5173)
npm run build       # tsc -b && vite build  → dist/
npm run preview     # preview the production build
npm run typecheck   # tsc --noEmit
```

Run **`npm run typecheck`** (and ideally `npm run build`) before considering a change done.

## Backend / API

Every request carries **two** auth layers (both required, handled in `src/lib/api.ts`):
`Authorization: Bearer <supabase_access_token>` **and** `x-functions-key: <VITE_AZURE_FUNCTION_KEY>`.

- The backend is the **source of truth**. It lives in sibling repo `../az-ai-personal-trainer`
  (Azure Functions under `src/functions/`) and is documented in
  `../ai-personal-trainer-expo-ui/API_docs.md`. Keep the `src/lib/api.ts` types in sync.
- Chat (`POST /api/chat`) is a **Server-Sent Events** stream — preserve the SSE parser and
  `AbortController` cleanup in `streamChat`.
- **Known backend/contract gaps that shape the UI are tracked in [backend-gaps.md](backend-gaps.md).**
  Read it before "fixing" UI that looks like placeholder data — some of it is placeholder
  *because the endpoint does not exist yet*.

## Running against the local backend

1. Start the backend: `cd ../az-ai-personal-trainer && npm start` (`func start` on `:7071`;
   `prestart` cleans + builds). CORS is already `*` in its `local.settings.json`, so the
   dev origin `http://localhost:5173` is allowed.
2. Point `.env` `VITE_API_BASE_URL` at `http://localhost:7071/api` (default) or the deployed
   Azure app. Restart `npm run dev` after any `.env` change (Vite inlines `VITE_*` at start).
3. A verified local test account lives in `../az-ai-personal-trainer/test-api.http`
   (`dadukes3@gmail.com`). That file also shows how to mint a Supabase token via the
   password grant for API-level testing.

## Environment

Only `VITE_*` vars reach the browser bundle (read in `src/lib/env.ts`); copy `.env.example` → `.env`:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL` (Azure Functions base, e.g. `https://<app>.azurewebsites.net/api`)
- `VITE_AZURE_FUNCTION_KEY`

The app degrades gracefully when config is missing (`env.hasApiConfig` / `env.hasSupabaseConfig`
gates surface a clear error instead of crashing).

## Differences from the mobile app (`../ai-personal-trainer-expo-ui`)

- Env vars are `VITE_*` (not `EXPO_PUBLIC_*`).
- Session/onboarding/profile-cache use `localStorage` (not `expo-secure-store`).
- `lib/api.ts` drops the Android `10.0.2.2` emulator remap.
- Health data is the mock **or a manual capture** — browsers have no Health Connect / Apple
  Health API, so Home has a "Log" dialog posting to `/health/sync`; a same-day capture replaces
  the mock in the snapshot (see `src/lib/health.ts` + backend-gaps.md #7).
- Navigation is responsive **sidebar (≥1024) → icon rail (768–1023) → bottom tabs (<768)**,
  not a fixed bottom tab bar.
- `expo-haptics` / `expo-clipboard` are dropped or degraded (no-ops).
