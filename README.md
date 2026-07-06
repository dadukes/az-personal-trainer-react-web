# Forma Fitness — Web (React)

**Fitness that fits you.** A web-only React build of the Forma Fitness AI personal
trainer, adapted from the Expo/React Native app (`../ai-personal-trainer-expo-ui`)
and the Claude Design *Forma Web App Prototype*. It talks to the **same Azure
Functions backend** and **Supabase Auth** as the mobile app.

## Stack

- **Vite + React 19 + TypeScript** (strict)
- **React Router 7** — routing + auth guard
- **Zustand** — cross-screen store (profile, chat, gamification, health, week plan)
- **Tailwind CSS 3** — with the Forma brand tokens (`forma.*`) + CSS design tokens
- **@supabase/supabase-js** — email/password auth, session in `localStorage`
- **lucide-react** — icons

## How it maps to the mobile app

| Mobile (`ai-personal-trainer-expo-ui`) | Web (this repo) |
|---|---|
| `lib/api.ts` (SSE chat, dual-auth fetch) | `src/lib/api.ts` — same contract, no Android `10.0.2.2` remap |
| `lib/supabase.ts` (expo-secure-store) | `src/lib/supabase.ts` — browser `localStorage` |
| `lib/env.ts` (`EXPO_PUBLIC_*`) | `src/lib/env.ts` — Vite `VITE_*` |
| `lib/health.ts` (Health Connect + mock) | `src/lib/health.ts` — always mock (no web health API) |
| `store/useAppStore.ts` | `src/store/useAppStore.ts` — identical slices |
| `providers/auth-provider.tsx` | `src/providers/AuthProvider.tsx` |
| `app/(tabs)/*`, `(auth)/*`, `workout/*` | `src/pages/*` |
| Bottom tab bar | Responsive: **sidebar** (≥1024) → **icon rail** (768–1023) → **bottom tabs** (<768) |

### Screens

`Login/Sign up · Onboarding (3 steps) · Home · Coach (SSE chat + context panel) ·
Fuel (drag-and-drop photo logging) · Progress · Plan day view · Guided workout
session · Chat history`.

### Platform adaptations

- **Auth/session** persist in `localStorage` (not SecureStore).
- **Meal photos** use `<input type="file" capture>` + drag-and-drop instead of a native camera picker.
- **Health data**: browsers have no Health Connect / Apple Health API, so the health
  snapshot always uses the same realistic **mock** the mobile app falls back to in Expo Go.
- **Haptics/clipboard** are dropped/degraded (no-ops).

## Backend contract

Every request carries **two** auth layers (handled in `src/lib/api.ts`):
`Authorization: Bearer <supabase_access_token>` and `x-functions-key: <VITE_AZURE_FUNCTION_KEY>`.
Chat (`POST /api/chat`) is a **Server-Sent Events** stream — the resilient SSE parser
from the mobile app is preserved.

> The backend must allow this origin via **CORS**. When running the Azure Functions
> backend locally (`func start` on `:7071`), add the dev origin (`http://localhost:5173`)
> to the function app's CORS settings, or run behind a proxy.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values (see below)
npm run dev            # http://localhost:5173
```

`.env` (Vite only exposes `VITE_*` to the browser):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_API_BASE_URL=http://localhost:7071/api   # or https://<app>.azurewebsites.net/api
VITE_AZURE_FUNCTION_KEY=...
```

A local `.env` is pre-filled with the same values as the mobile app for convenience
(gitignored). Point `VITE_API_BASE_URL` at the deployed backend to skip running
`func start`.

## Scripts

```bash
npm run dev         # Vite dev server
npm run build       # tsc -b && vite build  → dist/
npm run preview     # preview the production build
npm run typecheck   # tsc --noEmit
```

## Notes / follow-ups

- The Progress "This week" stats (streak / workouts / minutes) are illustrative — the
  backend `GET /api/progress` returns level, XP, and health insights only. Wire them
  up when a stats endpoint exists.
- `Fuel` "Recent meals" list is session-local (there is no meal-history GET endpoint yet).
- Consider code-splitting (dynamic `import()`) if bundle size becomes a concern.
