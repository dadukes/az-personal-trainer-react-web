# AI Personal Trainer — API Documentation

This document describes every HTTP endpoint exposed by the Azure Functions backend. It covers the two-layer authentication mechanism, base URL conventions, and provides a full request/response example for each endpoint.

---

## Table of Contents

1. [Authentication](#authentication)
   - [Layer 1: Azure Function Key](#layer-1-azure-function-key)
   - [Layer 2: Supabase JWT](#layer-2-supabase-jwt)
   - [Combined Example](#combined-example)
2. [Base URL](#base-url)
3. [Common Error Responses](#common-error-responses)
4. [Endpoints](#endpoints)
   - [POST /api/chat](#post-apichat)
   - [GET /api/chat/history](#get-apichathistory)
   - [GET /api/chat/sessions](#get-apichatsessions)
   - [POST /api/chat/sessions](#post-apichatsessions)
   - [GET /api/dashboard](#get-apidashboard)
   - [GET /api/progress](#get-apiprogress)
   - [GET /api/progress/insights](#get-apiprogressinsights)
    - [GET /api/profile](#get-apiprofile)
    - [PATCH /api/profile](#patch-apiprofile)
   - [PUT /api/profile](#put-apiprofile)
   - [POST /api/health/pulse](#post-apihealthpulse)
   - [POST /api/health/sync](#post-apihealthsync)
   - [GET /api/health/logs](#get-apihealthlogs)
   - [POST /api/activity/log](#post-apiactivitylog)
   - [POST /api/nutrition/log](#post-apinutritionlog)
   - [GET /api/nutrition/logs](#get-apinutritionlogs)
   - [GET /api/exercises/{exerciseId}](#get-apiexercisesexerciseid)
   - [POST /api/workouts/log](#post-apiworkoutslog)
   - [GET /api/workouts/plan](#get-apiworkoutsplan)
   - [PATCH /api/workouts/plan/{planId}/day/{day}](#patch-apiworkoutsplanplaniddayday)
   - [GET /api/exercises](#get-apiexercises)
   - [GET /api/exercises/{exerciseId}/alternatives](#get-apiexercisesexerciseidalternatives)
   - [POST /api/exercises/batch](#post-apiexercisesbatch)
   - [GET /api/workouts/last-performance](#get-apiworkoutslast-performance)
  - [POST /api/ai/extract](#post-apiaiextract)
5. [Data Models](#data-models)

---

## Authentication

Every endpoint requires **two** independent authentication layers that must both be satisfied on every request.

### Layer 1: Azure Function Key

All endpoints are deployed with `authLevel: 'function'`. This means Azure will reject any request that does not supply a valid Function Key **before** the handler code ever runs.

Supply the key via either mechanism (pick one):

| Method | Example |
|--------|---------|
| Query string | `?code=<YOUR_FUNCTION_KEY>` |
| Header | `x-functions-key: <YOUR_FUNCTION_KEY>` |

The Function Key acts as a shared secret between the mobile app and the Azure deployment. It mitigates DDoS/spam by blocking unauthenticated invocations at the infrastructure layer.

> **How to obtain:** In the Azure Portal, navigate to your Function App → Functions → select the function → Function Keys. You can also retrieve keys via the Azure CLI (`az functionapp keys list`).

### Layer 2: Supabase JWT

After the Function Key check passes, every handler validates the caller's **Supabase access token**. The token is extracted from the standard HTTP `Authorization` header as a Bearer token, then verified by the Supabase Admin SDK (`auth.getUser(token)`).

```
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

The access token is the JWT issued by Supabase Auth when the user signs in (available as `session.access_token` in the Supabase JS/React Native SDK). The token encodes the user's UUID, which the backend uses to scope all database queries.

Tokens expire (typically after 1 hour). The mobile client must refresh the session using the Supabase SDK and re-attach the new access token on each request.

### Combined Example

A fully authenticated request always includes **both**:

```http
POST https://<your-app>.azurewebsites.net/api/chat?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

---

## Base URL

```
https://<your-function-app-name>.azurewebsites.net/api
```

Replace `<your-function-app-name>` with your Azure Function App's resource name. All paths below are relative to this base.

---

## Common Error Responses

All endpoints return JSON error bodies with a consistent shape unless otherwise noted.

| Status | Condition | Body |
|--------|-----------|------|
| `401 Unauthorized` | Missing or invalid Supabase Bearer token | `{ "success": false, "error": "Unauthorized. Missing or invalid Supabase Bearer token." }` |
| `403 Forbidden` | Authenticated user attempted to act on another user's data | `{ "success": false, "error": "Forbidden. userId must match the authenticated user." }` |
| `400 Bad Request` | Missing or invalid request fields | `{ "success": false, "error": "<descriptive message>" }` |
| `500 Internal Server Error` | Unexpected server-side failure | `{ "success": false, "error": "<error message>" }` |

---

## Endpoints

---

### POST /api/chat

Sends a message to the AI coach and returns a **Server-Sent Events (SSE) stream**. The response is streamed chunk-by-chunk to keep the mobile UI responsive despite LLM generation latency.

The backend:
1. Generates a vector embedding of the user's message.
2. Resolves the active **chat session** for the user's local day (or opens a new one — see [chat sessions](#post-apichatsessions)). When the previous session rolls over, it is lazily summarized and consolidated into long-term memory in the background.
3. Fetches the user's base profile plus layered memory: the current session's prior turns, recent session recaps, relevant older sessions (summary RAG), message-level RAG, and global user memory (permanent + active temporary facts).
4. Builds a personalized system instruction from the profile and all memory layers.
5. Calls Gemini (with tool-calling) and streams text chunks back as they arrive.
6. Saves both the user message and the assistant response to the database (stamped with `session_id`) with embeddings.

#### Request

```http
POST /api/chat?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `string` | Yes | The user's message to the coach |
| `userId` | `string` | No | Must match the authenticated user's UUID when provided; inferred from the JWT if omitted |
| `forceNewSession` | `boolean` | No | When `true`, closes the current session and starts a fresh one for this message |

```json
{
  "message": "I'm feeling too tired to work out today."
}
```

#### Response

**Status: `200 OK`**

**Headers:**

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

The response body is an SSE stream. Each event follows the standard SSE format:

```
event: <event_name>
data: <JSON payload>

```

**SSE Event Reference:**

| Event | Payload | When emitted |
|-------|---------|--------------|
| `status` | `{ "stage": "started" }` | Immediately when the stream opens |
| `status` | `{ "stage": "generating", "ragMessageCount": 3 }` | Once Gemini generation begins; includes how many past messages were retrieved via RAG |
| `chunk` | `{ "text": "partial response text..." }` | Repeatedly as Gemini generates the response |
| `done` | `{ "success": true }` | After generation completes and messages are saved |
| `error` | `{ "message": "error description" }` | On failure; the stream closes immediately after |
| `ping` | `{ "timestamp": "2026-04-19T10:30:15.000Z" }` | Every ~15 seconds to keep the connection alive through proxies |

**Full stream example:**

```
event: status
data: {"stage":"started"}

event: status
data: {"stage":"generating","ragMessageCount":3}

event: chunk
data: {"text":"It sounds like you're having a tough day. That's completely okay! "}

event: chunk
data: {"text":"Even a 5-minute gentle stretch counts as a real win. "}

event: chunk
data: {"text":"What would feel manageable right now?"}

event: done
data: {"success":true}
```

**Error responses (before stream opens):**

| Status | Condition |
|--------|-----------|
| `400` | `message` field is missing or empty |
| `401` | Invalid or missing Bearer token |
| `403` | Provided `userId` does not match the authenticated user |

**Error within stream (after `200` is returned):**

```
event: error
data: {"message":"User profile was not found. Please complete onboarding first."}
```

---

### GET /api/chat/history

Returns the authenticated user's chat history in ascending chronological order (oldest message first), with cursor-based pagination via `limit` and `offset`.

#### Request

```http
GET /api/chat/history?limit=50&offset=0&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `number` | `50` | `100` | Number of messages to return per page |
| `offset` | `number` | `0` | — | Zero-based row offset for pagination |
| `sessionId` | `string` (UUID) | — | — | When provided, returns only that session's messages (ascending) instead of the full paginated history. Returns `404` if the session is not the caller's. |

#### Response

**`200 OK`**

```json
{
  "success": true,
  "messages": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "usr-uuid-here",
      "session_id": "se55i0n-uuid-here",
      "role": "user",
      "content": "I'm feeling too tired to work out today.",
      "embedding": null,
      "tool_name": null,
      "tool_args": null,
      "tool_result": null,
      "created_at": "2026-04-19T10:30:00+00:00"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "user_id": "usr-uuid-here",
      "role": "model",
      "content": "It sounds like you're having a tough day. That's completely okay! Even a 5-minute gentle stretch counts as a real win. What would feel manageable right now?",
      "embedding": null,
      "tool_name": null,
      "tool_args": null,
      "tool_result": null,
      "created_at": "2026-04-19T10:30:05+00:00"
    }
  ]
}
```

**Message fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Unique message ID |
| `session_id` | `string` (UUID) \| `null` | The session the message belongs to (`null` for legacy rows) |

---

### GET /api/chat/sessions

Returns the authenticated user's chat sessions, newest first, for a session-list UI. The pgvector `summary_embedding` is omitted from the response.

If the user's single open session belongs to an earlier calendar day (in their timezone), it is **closed before the list is returned** so a day-old session never appears as `"open"` in the UI — its summary + memory consolidation are then generated in the background. A new session is **not** opened here; the [chat](#post-apichat) endpoint opens today's session when the user next sends a message.

#### Request

```http
GET /api/chat/sessions?limit=30&offset=0&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | `number` | `30` | `100` | Number of sessions to return per page |
| `offset` | `number` | `0` | — | Zero-based row offset for pagination |

#### Response

**`200 OK`**

```json
{
  "success": true,
  "sessions": [
    {
      "id": "se55i0n-uuid-here",
      "user_id": "usr-uuid-here",
      "session_date": "2026-04-19",
      "status": "closed",
      "title": null,
      "summary": "Worked through low energy; committed to a 10-minute walk.",
      "summary_json": { "key_facts": [], "commitments": ["10-minute walk"], "emotional_state": "tired but willing", "decisions": [], "one_line": "Worked through low energy; committed to a 10-minute walk." },
      "message_count": 6,
      "started_at": "2026-04-19T10:30:00+00:00",
      "closed_at": "2026-04-20T09:00:00+00:00",
      "consolidated_at": "2026-04-20T09:00:05+00:00",
      "created_at": "2026-04-19T10:30:00+00:00",
      "updated_at": "2026-04-20T09:00:05+00:00"
    }
  ]
}
```

---

### POST /api/chat/sessions

Force-starts a new chat session, closing the current open one (which becomes eligible for background summarization + memory consolidation). Returns the newly created session.

#### Request

```http
POST /api/chat/sessions?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

No body is required.

#### Response

**`200 OK`**

```json
{
  "success": true,
  "session": {
    "id": "new-se55i0n-uuid",
    "user_id": "usr-uuid-here",
    "session_date": "2026-04-20",
    "status": "open",
    "title": null,
    "summary": null,
    "summary_json": null,
    "message_count": 0,
    "started_at": "2026-04-20T09:00:00+00:00",
    "closed_at": null,
    "consolidated_at": null,
    "created_at": "2026-04-20T09:00:00+00:00",
    "updated_at": "2026-04-20T09:00:00+00:00"
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `401` | Invalid or missing Bearer token |
| `404` | User profile not found (onboarding incomplete) |

---

### POST /api/ai/extract

Stateless LLM extraction endpoint for frontend conversational forms (for example onboarding). The mobile app sends the latest user message, optional history, and a dynamic extraction schema. The backend returns a structured payload that indicates whether extraction is complete or requires a follow-up question.

This endpoint does **not** persist history or output server-side.

#### Request

```http
POST /api/ai/extract?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input_text` | `string` | Yes | Latest user natural-language input |
| `history` | `{ role, content }[]` | No | Frontend-supplied context (roles: `user` or `assistant`) |
| `schema` | `object` | Yes | Dynamic field extraction definition |
| `userId` | `string` | No | Must match authenticated user UUID if provided |

Example request body:

```json
{
  "input_text": "I get nervous in gyms and I want a calm coach.",
  "history": [
    { "role": "assistant", "content": "What concerns do you have about starting fitness?" }
  ],
  "schema": {
    "objective": "Extract onboarding preferences",
    "fields": [
      {
        "key": "coach_personality",
        "description": "Preferred coaching style",
        "type": "string",
        "required": true,
        "enum": ["cheerleader", "zen", "analyst"]
      },
      {
        "key": "fears",
        "description": "Main fears about starting fitness",
        "type": "string_array",
        "required": true
      }
    ]
  }
}
```

#### Response

**`200 OK`**

The response always includes this envelope:

| Field | Type | Description |
|-------|------|-------------|
| `process_complete` | `boolean` | `true` when all required data is captured |
| `extract_data` | `object` | Structured extracted values (partial allowed when incomplete) |
| `follow_on_question` | `string` \| `null` | Follow-up question for frontend when incomplete |

Complete example:

```json
{
  "process_complete": true,
  "extract_data": {
    "coach_personality": "zen",
    "fears": ["gym intimidation"]
  },
  "follow_on_question": null
}
```

Incomplete example:

```json
{
  "process_complete": false,
  "extract_data": {
    "fears": ["fear of injury"]
  },
  "follow_on_question": "What coach style motivates you most: calm, energetic, or analytical?"
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | Invalid payload (missing `input_text`, invalid `schema`, malformed `history`) |
| `401` | Missing/invalid Bearer token |
| `403` | `userId` does not match authenticated user |
| `500` | Unexpected LLM/backend failure |
| `user_id` | `string` (UUID) | Owner's user ID |
| `role` | `"user"` or `"model"` | Who sent the message |
| `content` | `string` | Message text |
| `embedding` | `null` | Vector embedding (omitted from the API response to keep payload size manageable) |
| `tool_name` | `string` or `null` | Populated when the message represents an AI tool call |
| `tool_args` | `object` or `null` | Arguments passed to the tool |
| `tool_result` | `object` or `null` | Result returned by the tool |
| `created_at` | `string` (ISO 8601) | Timestamp of the message |

---

### GET /api/dashboard

Returns all data required to render the home screen dashboard in a single request: the user's active workout plan and any pending AI coaching insights.

**Important:** Pending insights are **atomically consumed** on retrieval. They are returned in the response and immediately marked `is_consumed = true` in the database, so each coaching nudge is shown to the user exactly once.

#### Request

```http
GET /api/dashboard?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "data": {
    "active_workout_plan": {
      "id": "plan-uuid-here",
      "user_id": "usr-uuid-here",
      "week_start": "2026-04-14",
      "is_active": true,
      "ai_notes": "Keeping sessions short this week since you mentioned feeling stressed.",
      "plan": {
        "monday": {
          "is_rest_day": false,
          "focus": "Upper Body Basics",
          "estimated_duration_minutes": 20,
          "ai_notes": "Go at your own pace — form over speed.",
          "warmup": [
            { "name": "Arm Circles", "duration_seconds": 30 }
          ],
          "exercises": [
            { "name": "Push-Ups", "sets": 3, "reps": "8-10", "rest_seconds": 60 },
            { "name": "Dumbbell Rows", "sets": 3, "reps": "10", "rest_seconds": 60 }
          ],
          "cooldown": [
            { "name": "Chest Stretch", "duration_seconds": 30 }
          ]
        },
        "tuesday": {
          "is_rest_day": true
        }
      },
      "created_at": "2026-04-14T08:00:00+00:00",
      "updated_at": "2026-04-14T08:00:00+00:00"
    },
    "pending_insights": [
      {
        "id": "insight-uuid-here",
        "user_id": "usr-uuid-here",
        "insight_type": "poor_sleep",
        "payload": {
          "ai_message": "Rough night? Your sleep dropped to 4.5 hours. Let's take it easy today.",
          "suggested_action": "Try a 10-minute gentle yoga flow instead of your scheduled workout.",
          "ui_action": "adjust_plan"
        },
        "is_consumed": false,
        "created_at": "2026-04-19T07:45:00+00:00"
      }
    ],
    "completed_days": {
      "monday": {
        "session_id": "session-uuid-here",
        "completed_at": "2026-04-14T18:12:00+00:00"
      }
    }
  }
}
```

When there is no active plan, `active_workout_plan` is `null`. When there are no new insights, `pending_insights` is an empty array `[]`.

**`completed_days` — authoritative workout completion for the current week.**
Keyed by weekday name (`"monday"` … `"sunday"`), it contains one entry per day of the **current (Monday-start) week, in the user's timezone**, on which a workout was logged for the **active plan** (matched by `plan_id`). Days without a completed workout are simply absent, and the whole map is `{}` when there is no active plan or nothing has been logged this week. Use this instead of client-local storage so the "Completed 💪" badge is consistent across devices. Each entry:

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | `string` | The `workout_sessions` row for that day (most recent if logged more than once) |
| `completed_at` | `string` | ISO-8601 completion timestamp |

**`pending_insights[].payload` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `ai_message` | `string` | Empathetic coaching message to display to the user |
| `suggested_action` | `string` | A concrete next-step suggestion |
| `ui_action` | `string` | Mobile UI hint (e.g. `"show_modal"`, `"adjust_plan"`, `"open_breathing"`) |

---

### GET /api/progress

Returns the authenticated user's gamification state (level and XP), the "this week" activity summary, and deterministic health-metric aggregates over the last 30 days.

**This endpoint does NO LLM work, so it returns fast.** AI-generated health-trend insights are served separately (and cached) by [`GET /api/progress/insights`](#get-apiprogressinsights). Fetch that endpoint asynchronously and render the cards when they arrive.

#### Request

```http
GET /api/progress?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "data": {
    "current_level": 4,
    "current_xp": 1850,
    "xp_to_next_level": 2000,
    "this_week": {
      "consistency_streak_days": 5,
      "workouts_this_week": 3,
      "minutes_trained_this_week": 95
    },
    "health_summary": {
      "window_days": 30,
      "days_logged": 22,
      "avg_sleep_hours": 6.8,
      "avg_sleep_quality": 3.4,
      "avg_stress_level": 2.7,
      "avg_energy_level": 3.5,
      "avg_resting_heart_rate": 61,
      "avg_steps": 7421,
      "avg_active_calories": 430,
      "trends": {
        "sleep_hours": "up",
        "sleep_quality": "flat",
        "stress_level": "down",
        "energy_level": "up",
        "resting_heart_rate": "down",
        "steps": "up",
        "active_calories": "flat"
      }
    },
    "health_insights": []
  }
}
```

**Gamification notes:**
- `current_level` = `floor(current_xp / 500) + 1` (1-based, 500 XP per level).
- `xp_to_next_level` = `current_level × 500`.

**`this_week` (activity summary, all computed in the user's timezone):**
- `consistency_streak_days` — consecutive local calendar days, ending today (or yesterday if nothing is logged yet today), with at least one logged activity (workouts + micro-wins). `0` when the streak is broken.
- `workouts_this_week` — completed guided workouts logged via `POST /api/workouts/log` in the current Monday-start week.
- `minutes_trained_this_week` — total minutes across those workouts (rounded).
- All three are `0` for a user with no logs.

**`health_summary` (deterministic aggregates over the last 30 days of `health_metrics`):**
- `window_days` — the lookback window (currently `30`).
- `days_logged` — distinct calendar days in the window with at least one logged metric.
- `avg_*` — mean over the **non-null** values for each field only, so a user who logs sleep but never syncs a wearable still gets a real `avg_sleep_hours` while `avg_steps` stays `null`. Any `avg_*` is `null` when no day logged that field.
  - `avg_sleep_quality`, `avg_stress_level`, `avg_energy_level` are on the subjective 1–5 scale (rounded to 1 decimal).
  - `avg_sleep_hours` is rounded to 1 decimal; `avg_resting_heart_rate`, `avg_steps`, `avg_active_calories` are integers.
- `trends` — per-field direction (`"up"` / `"down"` / `"flat"`) comparing the most-recent 7 days against the 7 days before them. `null` when either window lacks data for that field. Trends are purely directional (did the number rise or fall) — the client decides whether a direction is "good" for a given metric.

**`health_insights`** — always an empty array `[]` on this endpoint. Retained only so existing clients that read the field keep working; **use [`GET /api/progress/insights`](#get-apiprogressinsights) for insight cards.**

---

### GET /api/progress/insights

Returns AI-generated health-trend insight cards for the Progress screen, based on the last 30 days of health metrics. Split out from `GET /api/progress` so the main screen never blocks on the LLM.

**Caching:** results are cached per user for up to **6 hours**. A cache hit returns instantly with no LLM call; a miss or stale entry regenerates via Gemini and refreshes the cache. If regeneration fails, the last cached set is returned with `stale: true` (HTTP 200) rather than an error.

#### Request

```http
GET /api/progress/insights?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "data": {
    "health_insights": [
      {
        "title": "Resting Heart Rate Improving",
        "description": "Your resting HR has dropped by 3 BPM over the last month — a sign your cardio fitness is improving.",
        "icon": "heart_pulse"
      },
      {
        "title": "Sleep Consistency",
        "description": "You've averaged 7.2 hours of sleep this week, up from 6.0 hours last week. Great work!",
        "icon": "sleep"
      }
    ],
    "generated_at": "2026-07-11T08:15:00.000Z",
    "stale": false
  }
}
```

**Notes:**
- `health_insights` is an empty array `[]` (and `generated_at` is `null`) when the user has no health metrics recorded or has not completed onboarding. An empty result is **not** cached, so insights appear as soon as the user has a profile and logs their first metric.
- `generated_at` — ISO timestamp the returned insights were generated, or `null` when never generated.
- `stale` — `true` only when regeneration failed and the endpoint fell back to an expired cached set; clients may show an "updating…" hint. `false` for fresh or still-within-TTL insights.

**`health_insights[].icon` — stable enum.** The value is always one of:
`heart_pulse` · `sleep` · `steps` · `stress` · `energy` · `calories` · `workout` · `trophy` · `trending_up` · `general`.
Any other value the model might produce is coerced server-side to `general`, so clients can map exactly this set and safely fall back on `general`.

---

### GET /api/profile

Returns the authenticated user's current profile. This is the canonical read endpoint for onboarding state and user preferences.

#### Request

```http
GET /api/profile?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "profile": {
    "id": "usr-uuid-here",
    "email": "alex@example.com",
    "display_name": "Alex",
    "fitness_level": "beginner",
    "primary_goal": "general_fitness",
    "fears": ["injury", "judgement"],
    "limitations": ["lower back pain"],
    "preferred_duration_minutes": 20,
    "available_days": ["monday", "wednesday", "friday"],
    "equipment_available": ["resistance bands", "yoga mat"],
    "coach_personality": "zen",
    "preferred_unit_system": "metric",
    "timezone": "UTC",
    "created_at": "2026-04-01T09:00:00+00:00",
    "updated_at": "2026-04-19T10:45:00+00:00"
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `404` | User profile does not exist yet |

---

### PATCH /api/profile

Partially updates an existing user profile. Only the fields supplied in the request body are written. Unlike `PUT /api/profile`, this endpoint does not create a missing profile row.

#### Request

```http
PATCH /api/profile?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body (all optional, at least one required):**

| Field | Type | Allowed values | Description |
|-------|------|----------------|-------------|
| `coach_personality` | `string` | `"cheerleader"`, `"zen"`, `"analyst"` | Controls the tone of all AI coaching responses |
| `fitness_level` | `string` | `"beginner"`, `"intermediate"`, `"advanced"` | User's self-reported fitness baseline |
| `primary_goal` | `string` | `"weight_loss"`, `"muscle_gain"`, `"general_fitness"`, `"endurance"`, `"flexibility"`, `"stress_relief"` | The user's main training goal (from the onboarding "What's your goal?" step) |
| `preferred_duration_minutes` | `number` | Positive integer | Target workout length in minutes |
| `fears` | `string[]` | Any strings | Things the user is afraid of (e.g. `["injury", "judgement"]`) |
| `available_days` | `string[]` | Day names | Days available for workouts (e.g. `["monday", "wednesday", "friday"]`). This array of lowercase day names is the **source of truth** for training rhythm — a client that collects a day *count* (e.g. "3 days/week") should map it to specific day names before sending. |
| `display_name` | `string` | Any string | User's preferred name for the coach to use |
| `limitations` | `string[]` | Any strings | Physical limitations or injuries (e.g. `["bad knees", "lower back pain"]`) |
| `equipment_available` | `string[]` | Any strings | Equipment the user has access to (e.g. `["dumbbells", "resistance bands"]`) |

**Example — patching a single field:**

```json
{
  "display_name": "Alex"
}
```

**Example — patching multiple fields:**

```json
{
  "fitness_level": "intermediate",
  "preferred_duration_minutes": 30,
  "available_days": ["tuesday", "thursday", "saturday"]
}
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "profile": {
    "id": "usr-uuid-here",
    "email": "alex@example.com",
    "display_name": "Alex",
    "fitness_level": "intermediate",
    "primary_goal": "general_fitness",
    "fears": ["injury", "judgement"],
    "limitations": ["lower back pain"],
    "preferred_duration_minutes": 30,
    "available_days": ["tuesday", "thursday", "saturday"],
    "equipment_available": ["resistance bands", "yoga mat"],
    "coach_personality": "zen",
    "preferred_unit_system": "metric",
    "timezone": "UTC",
    "created_at": "2026-04-01T09:00:00+00:00",
    "updated_at": "2026-04-19T10:45:00+00:00"
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | No updatable fields were provided |
| `400` | `coach_personality` is not one of the allowed values |
| `400` | `fitness_level` is not one of the allowed values |
| `400` | `primary_goal` is not one of the allowed values |
| `400` | `preferred_duration_minutes` is not a positive number |

---

### PUT /api/profile

Updates the authenticated user's profile preferences. All fields are optional — only the fields provided are updated. Used during initial onboarding and whenever the user adjusts their settings in-app.

#### Request

```http
PUT /api/profile?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body (all optional, at least one required):**

| Field | Type | Allowed values | Description |
|-------|------|----------------|-------------|
| `coach_personality` | `string` | `"cheerleader"`, `"zen"`, `"analyst"` | Controls the tone of all AI coaching responses |
| `fitness_level` | `string` | `"beginner"`, `"intermediate"`, `"advanced"` | User's self-reported fitness baseline |
| `primary_goal` | `string` | `"weight_loss"`, `"muscle_gain"`, `"general_fitness"`, `"endurance"`, `"flexibility"`, `"stress_relief"` | The user's main training goal (from the onboarding "What's your goal?" step) |
| `preferred_duration_minutes` | `number` | Positive integer | Target workout length in minutes |
| `fears` | `string[]` | Any strings | Things the user is afraid of (e.g. `["injury", "judgement"]`) |
| `available_days` | `string[]` | Day names | Days available for workouts (e.g. `["monday", "wednesday", "friday"]`). This array of lowercase day names is the **source of truth** for training rhythm — a client that collects a day *count* (e.g. "3 days/week") should map it to specific day names before sending. |
| `display_name` | `string` | Any string | User's preferred name for the coach to use |
| `limitations` | `string[]` | Any strings | Physical limitations or injuries (e.g. `["bad knees", "lower back pain"]`) |
| `equipment_available` | `string[]` | Any strings | Equipment the user has access to (e.g. `["dumbbells", "resistance bands"]`) |

**Example — full onboarding payload:**

```json
{
  "coach_personality": "zen",
  "fitness_level": "beginner",
  "preferred_duration_minutes": 20,
  "fears": ["injury", "judgement"],
  "available_days": ["monday", "wednesday", "friday"],
  "display_name": "Alex",
  "limitations": ["lower back pain"],
  "equipment_available": ["resistance bands", "yoga mat"]
}
```

**Example — updating a single preference:**

```json
{
  "coach_personality": "cheerleader"
}
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "profile": {
    "id": "usr-uuid-here",
    "email": "alex@example.com",
    "display_name": "Alex",
    "fitness_level": "beginner",
    "primary_goal": "general_fitness",
    "fears": ["injury", "judgement"],
    "limitations": ["lower back pain"],
    "preferred_duration_minutes": 20,
    "available_days": ["monday", "wednesday", "friday"],
    "equipment_available": ["resistance bands", "yoga mat"],
    "coach_personality": "zen",
    "preferred_unit_system": "metric",
    "timezone": "UTC",
    "created_at": "2026-04-01T09:00:00+00:00",
    "updated_at": "2026-04-19T10:45:00+00:00"
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | No updatable fields were provided |
| `400` | `coach_personality` is not one of the allowed values |
| `400` | `fitness_level` is not one of the allowed values |
| `400` | `primary_goal` is not one of the allowed values |
| `400` | `preferred_duration_minutes` is not a positive number |

---

### POST /api/health/pulse

Records a quick "Pulse Check" stress reading from the mobile home screen. Performs an **upsert** — repeated submissions for the same date update the existing record rather than creating a duplicate.

This endpoint deliberately only touches the `stress_level` column so it does not overwrite wearable data (sleep, heart rate, etc.) that may have been synced separately for the same date.

#### Request

```http
POST /api/health/pulse?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stress_level` | `number` | Yes | Integer 1–5 (1 = very calm, 5 = very stressed) |
| `date` | `string` | No | ISO 8601 date string `"YYYY-MM-DD"`; defaults to today |

```json
{
  "stress_level": 4,
  "date": "2026-04-19"
}
```

#### Response

**`200 OK`**

```json
{
  "status": "recorded"
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | `stress_level` is missing, not an integer, or outside the range 1–5 |

---

### POST /api/health/sync

Ingests a full set of health metrics from the mobile app (typically from a background wearable sync task) and triggers AI-generated proactive coaching insights when health thresholds are crossed (e.g. poor sleep, high stress).

Performs an **upsert** per user/date, so calling this endpoint multiple times for the same date safely updates the existing record.

> **Performance note:** This endpoint is called from a mobile OS background task with a tight 15–30 second timeout. The AI insight evaluation (~3–5 s) is performed inline within that budget.

#### Request

```http
POST /api/health/sync?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body (all health fields optional, at least the body itself is required):**

| Field | Type | Description |
|-------|------|-------------|
| `logged_date` | `string` | ISO 8601 date `"YYYY-MM-DD"`; defaults to today |
| `sleep_hours` | `number` | Total hours slept |
| `sleep_quality` | `number` | Integer 1–5 (1 = very poor, 5 = excellent) |
| `stress_level` | `number` | Integer 1–5 (1 = very calm, 5 = very stressed) |
| `energy_level` | `number` | Integer 1–5 (1 = exhausted, 5 = very energetic) |
| `resting_heart_rate` | `number` | Resting heart rate in BPM |
| `step_count` | `number` | Total steps for the day |
| `active_calories_burned` | `number` | Active calories burned |
| `notes` | `string` | Optional free-text note |

```json
{
  "logged_date": "2026-04-19",
  "sleep_hours": 4.5,
  "sleep_quality": 2,
  "stress_level": 4,
  "energy_level": 2,
  "resting_heart_rate": 68,
  "step_count": 3200,
  "active_calories_burned": 180
}
```

#### Response

**`200 OK`**

```json
{
  "success": true
}
```

Any AI coaching insights generated by the threshold evaluation are stored in `pending_insights` and surfaced to the user on the next call to `GET /api/dashboard`.

---

### GET /api/health/logs

Reads back the authenticated user's manual health captures — the counterpart to `POST /api/health/sync`, which upserts one row per user/day. This lets any device prefill the Home "Log / Update" health dialog and render the snapshot tiles from the server rather than from device-local `localStorage`.

Two modes:

- **Single day** — pass `date` to fetch that day's capture (or `null` when none exists).
- **Recent list** — omit `date` to get the most recent captures, newest first.

#### Request

```http
GET /api/health/logs?date=2026-04-19&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `date` | `string` | ISO 8601 date `"YYYY-MM-DD"`. When present, returns that single day's capture; when omitted, returns the recent list. |
| `limit` | `number` | List mode only. Max rows to return (default 30, max 90). |

#### Response

**`200 OK` (with `date`)** — `log` is the capture for that date, or `null`:

```json
{
  "success": true,
  "log": {
    "id": "…",
    "user_id": "…",
    "logged_date": "2026-04-19",
    "sleep_hours": 4.5,
    "sleep_quality": 2,
    "stress_level": 4,
    "energy_level": 2,
    "resting_heart_rate": 68,
    "step_count": 3200,
    "active_calories_burned": 180,
    "notes": null,
    "created_at": "2026-04-19T08:00:00Z",
    "updated_at": "2026-04-19T08:00:00Z"
  }
}
```

**`200 OK` (without `date`)** — `logs` is an array, most-recent first:

```json
{
  "success": true,
  "logs": [ { "…": "HealthMetric" } ]
}
```

**`400 Bad Request`** — `date` is present but malformed (not `YYYY-MM-DD`).

---

### POST /api/activity/log

Records a completed workout session or micro-win, awards XP to the user, and returns the updated gamification state.

**XP rewards by activity type:**

| Activity type | XP earned |
|---------------|-----------|
| `full_workout` | 100 |
| `walk` | 50 |
| `other` | 30 |
| `micro_win` | 25 |

#### Request

```http
POST /api/activity/log?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `activity_type` | `string` | Yes | One of `"full_workout"`, `"micro_win"`, `"walk"`, `"other"` |
| `duration_minutes` | `number` | No | Duration in minutes (positive number) |
| `notes` | `string` | No | Optional free-text note |

```json
{
  "activity_type": "micro_win",
  "duration_minutes": 10,
  "notes": "Felt much better after stretching."
}
```

#### Response

**`200 OK`**

```json
{
  "status": "success",
  "xp_earned": 25,
  "new_total_xp": 1875,
  "leveled_up": false
}
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"success"` | Confirms the activity was recorded |
| `xp_earned` | `number` | XP awarded for this activity |
| `new_total_xp` | `number` | User's cumulative XP after this activity |
| `leveled_up` | `boolean` | `true` if the user crossed a level threshold with this activity |

**Level-up example:**

```json
{
  "status": "success",
  "xp_earned": 100,
  "new_total_xp": 500,
  "leveled_up": true
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | `activity_type` is missing or not one of the allowed values |
| `400` | `duration_minutes` is provided but is not a positive number |

---

### POST /api/nutrition/log

Accepts a base64-encoded meal photo, passes it to Gemini Vision for analysis, stores the AI-estimated macros and coaching feedback, and returns the full nutrition log entry.

#### Request

```http
POST /api/nutrition/log?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image_base64` | `string` | Yes | Base64-encoded JPEG or PNG. The `data:image/jpeg;base64,` data URI prefix is accepted but optional |
| `context` | `string` | No | Optional user-provided context (e.g. `"Post-workout meal"`) to help the AI give more relevant feedback |

```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "context": "Eating this after my morning workout."
}
```

#### Response

**`200 OK`**

```json
{
  "id": "log-uuid-here",
  "meal_description": "Grilled chicken bowl with brown rice, avocado, and mixed greens",
  "estimated_calories": 580,
  "protein_g": 42,
  "carbs_g": 55,
  "fat_g": 16,
  "ai_feedback": "Looks like a well-balanced post-workout meal! Great protein hit. The avocado gives you healthy fats to support recovery. If you want to add more fiber next time, toss in some extra greens or beans.",
  "logged_at": "2026-04-19T12:15:00+00:00"
}
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Unique ID of the nutrition log entry |
| `meal_description` | `string` | AI-generated description of the meal |
| `estimated_calories` | `number` or `null` | AI-estimated total calories; `null` when confidence is low |
| `protein_g` | `number` or `null` | Estimated protein in grams |
| `carbs_g` | `number` or `null` | Estimated carbohydrates in grams |
| `fat_g` | `number` or `null` | Estimated fat in grams |
| `ai_feedback` | `string` or `null` | Non-judgmental coaching note about the meal |
| `logged_at` | `string` (ISO 8601) | Timestamp when the meal was logged |

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | `image_base64` field is missing or empty |

---

### GET /api/nutrition/logs

Returns the authenticated user's recently logged meals (most-recent first). Powers the Fuel
screen's "Recent meals" list so history survives refreshes and syncs across devices.

#### Request

```http
GET /api/nutrition/logs?limit=20&offset=0&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Query params (optional):**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | `50` | Max rows to return (capped at `100`) |
| `offset` | `number` | `0` | Rows to skip, for pagination |

#### Response

**`200 OK`**

```json
{
  "success": true,
  "logs": [
    {
      "id": "nutrition-uuid-here",
      "user_id": "usr-uuid-here",
      "logged_at": "2026-04-19T12:30:00+00:00",
      "meal_description": "Grilled chicken salad with avocado",
      "estimated_calories": 520,
      "protein_g": 45,
      "carbs_g": 22,
      "fat_g": 28,
      "ai_feedback": "Great protein source! Consider adding more fibre.",
      "created_at": "2026-04-19T12:30:00+00:00",
      "updated_at": "2026-04-19T12:30:00+00:00"
    }
  ]
}
```

`logs` is an empty array `[]` when the user has logged no meals (or the page is beyond the end).
Rows are ordered by `logged_at` descending. Each row is a full `nutrition_logs` record; macro
fields are `null` when AI confidence was low (same shape as the `POST /api/nutrition/log` response).

---

### GET /api/exercises/{exerciseId}

Returns the demo media + instructions for a single exercise, sourced from **ExerciseDB v2**
(RapidAPI) and cached server-side in `exercise_catalog`. Powers the in-workout "Form Demo" card
and the form-cue list. `exerciseId` is the canonical ExerciseDB v2 string id (e.g. `exr_…`),
which is also persisted onto plan exercises (see the [Workout Plan](#workout-plan) model).

#### Request

```http
GET /api/exercises/exr_41n2hZZdH9uyYFGZ?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "exercise": {
    "id": "exr_41n2hZZdH9uyYFGZ",
    "name": "Lever Pec Deck Fly",
    "gif_url": null,
    "image_url": "https://cdn.exercisedb.dev/Lever-Pec-Deck-Fly-Chest.png",
    "video_url": "https://cdn.exercisedb.dev/Lever-Pec-Deck-Fly-Chest.mp4",
    "instructions": ["Sit on the machine...", "Push the levers together..."],
    "tips": ["Use controlled movements", "Full range of motion"],
    "variations": ["Cable Crossover", "Incline Dumbbell Fly"],
    "target": "Pectoralis Major Clavicular Head",
    "target_muscles": ["Pectoralis Major Clavicular Head"],
    "secondary_muscles": ["Deltoid Anterior"],
    "equipment": "LEVERAGE MACHINE",
    "equipments": ["LEVERAGE MACHINE"],
    "body_part": "CHEST",
    "body_parts": ["CHEST"],
    "exercise_type": "STRENGTH",
    "overview": "A strength-building chest exercise...",
    "related_exercise_ids": ["exr_41n2hp76bAhGHCxj"]
  }
}
```

> **v2 note:** ExerciseDB v2 returns **mp4 `video_url`** (not just GIFs) plus `image_url`,
> `tips`, `variations`, `overview`, and `related_exercise_ids`. Singular `target` / `equipment` /
> `body_part` are the first element of their respective arrays, kept for frontend convenience.

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | `exerciseId` path segment is missing |
| `404` | The id is unknown to the catalog and the provider |

---

### POST /api/workouts/log

Persists a completed **guided workout** with per-set actuals (reps/weight/time), awards XP, and
returns the gamification state for the completion screen. XP is awarded through the same path as
`POST /api/activity/log` (a flat `full_workout` = 100), so `GET /api/progress` totals stay
consistent. Use `activity/log` for quick wins (`walk`, `micro_win`, `other`); use this endpoint
for full workouts.

#### Request

```http
POST /api/workouts/log?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan_id` | `string` (UUID) | No | The `active_workout_plan.id` this session came from |
| `day` | `string` | No | Day key, e.g. `"monday"` |
| `started_at` | `string` (ISO) | Yes | When the user started the workout |
| `completed_at` | `string` (ISO) | Yes | When they finished |
| `duration_seconds` | `number` | Yes | Active workout duration |
| `exercises` | `LoggedExercise[]` | Yes | Per-exercise, per-set actuals |

`LoggedExercise`: `{ exercise_id?, name, section: "warmup"|"main"|"cooldown", swapped_from?, skipped?, sets: LoggedSet[] }`
`LoggedSet`: `{ set_number, reps?, weight?, weight_unit?: "kg"|"lb", duration_seconds?, completed }`

> **Units** are stored exactly as sent — no conversion.

```json
{
  "plan_id": "plan-uuid-here",
  "day": "monday",
  "started_at": "2026-06-28T08:00:00Z",
  "completed_at": "2026-06-28T08:30:20Z",
  "duration_seconds": 1820,
  "exercises": [
    {
      "exercise_id": "exr_41n2hZZdH9uyYFGZ", "name": "Push-Ups", "section": "main",
      "sets": [
        { "set_number": 1, "reps": 10, "weight": 0, "weight_unit": "kg", "completed": true },
        { "set_number": 2, "reps": 9, "weight": 0, "weight_unit": "kg", "completed": true }
      ]
    },
    {
      "name": "Plank", "section": "cooldown",
      "sets": [ { "set_number": 1, "duration_seconds": 45, "completed": true } ]
    }
  ]
}
```

#### Response

**`200 OK`**

```json
{
  "success": true,
  "xp_earned": 100,
  "new_total_xp": 1950,
  "leveled_up": false,
  "summary": { "total_sets": 3, "duration_seconds": 1820 }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | Missing `started_at` / `completed_at` / `duration_seconds`, or empty `exercises`, or an exercise without a name |

---

### GET /api/workouts/plan

Side-effect-free read of the user's active workout plan (the same `WorkoutPlan` shape nested in
`GET /api/dashboard`). Powers the **Day Detail** screen — unlike `GET /api/dashboard`, it does
**not** consume `pending_insights`, so the plan can be opened/browsed repeatedly. Pass `?planId=`
to read a specific (e.g. historical) plan; it must belong to the caller.

#### Request

```http
GET /api/workouts/plan?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`** — `plan` is `null` when the user has no active plan.

```json
{
  "success": true,
  "plan": {
    "id": "plan-uuid-here",
    "user_id": "usr-uuid-here",
    "week_start": "2026-06-29",
    "is_active": true,
    "ai_notes": "…",
    "plan": { "monday": { "is_rest_day": false, "exercises": [] }, "tuesday": { "is_rest_day": true } },
    "created_at": "…",
    "updated_at": "…"
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `404` | `?planId=` was given but no such plan exists for the caller |

---

### PATCH /api/workouts/plan/{planId}/day/{day}

Persist manual edits to a **single day** (reorder / add / remove / swap / adjust
sets·reps·weight·rest). The client sends the **entire edited `DayPlan`** and the server replaces
that day. Array **order is preserved** as sent. Any exercise with a `name` but no `exercise_id` is
fuzzy-matched against the ExerciseDB catalog and stamped (`exercise_id` / `target_muscle` /
`body_part`) on the way in. The day is flagged `manually_edited: true`. `{day}` is one of
`monday`…`sunday`.

#### Request

```http
PATCH /api/workouts/plan/plan-uuid-here/day/monday?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

**Body:** a full `DayPlan` (see [Workout Plan](#workout-plan) model).

```json
{
  "is_rest_day": false,
  "focus": "Upper Body",
  "estimated_duration_minutes": 30,
  "warmup": [{ "name": "Arm Circles", "duration_seconds": 30 }],
  "exercises": [
    {
      "name": "Incline Push-Ups", "exercise_id": "exr_0009", "sets": 3, "reps": "10-12",
      "rest_seconds": 60, "target_weight": 0, "weight_unit": "kg", "swapped_from": "exr_0662"
    },
    { "name": "Dumbbell Rows", "exercise_id": "exr_0292", "sets": 3, "reps": "10", "target_weight": 12.5, "weight_unit": "kg" }
  ],
  "cooldown": [{ "name": "Chest Stretch", "duration_seconds": 30 }]
}
```

#### Response

**`200 OK`** — the saved, canonical `DayPlan` (with any freshly-stamped `exercise_id`s).

```json
{ "success": true, "day": "monday", "plan": { "is_rest_day": false, "manually_edited": true, "exercises": [] } }
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | Invalid `{day}` key, or the body is not a `DayPlan` object |
| `403` | The plan belongs to another user |
| `404` | No plan exists for `{planId}` |

---

### GET /api/exercises

Find exercises for the "add exercise" / library flow. Two modes:

- **Name search** (`search` provided): the provider search is name-based, so it returns a single
  bounded result set — there is **no cursor** (`next_cursor` is `null`) and `offset` slices within
  that window. `body_part` / `equipment` are applied as post-filters.
- **Browse** (`search` blank): pages through the whole catalog with **real cursor pagination**.
  Pass the previous response's `next_cursor` back as `cursor` to get the next page; `body_part` /
  `equipment` are pushed down as provider-side filters (use the provider's enum values, e.g.
  `WAIST`, `DUMBBELL`). `next_cursor` is `null` on the last page.

List items are the full exercise shape, but heavy fields (`instructions` / `tips` / `video_url`)
may be empty for list/search-sourced rows — hydrate them lazily via
[`GET /api/exercises/{exerciseId}`](#get-apiexercisesexerciseid).

#### Request

```http
GET /api/exercises?search=row&body_part=back&equipment=dumbbell&limit=20&offset=0&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Browse the next page (no `search`):

```http
GET /api/exercises?body_part=WAIST&limit=20&cursor=exr_41n2hadPLLFRGvFk&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

| Query | Type | Description |
|-------|------|-------------|
| `search` | `string` | Name query. Blank ⇒ browse mode (cursor-paginated). |
| `body_part` | `string` | Optional body-part filter. Post-filter in search mode; provider-side in browse mode. |
| `equipment` | `string` | Optional equipment filter. Post-filter in search mode; provider-side in browse mode. |
| `limit` | `number` | Page size (default 20, max 50) |
| `offset` | `number` | Slice offset, **search mode only** (browse mode uses `cursor`) |
| `cursor` | `string` | **Browse mode only** — the `next_cursor` from a prior page |

#### Response

**`200 OK`** — `total` is a best-effort count (provider-reported when browsing, else result count).
`next_cursor` is the cursor for the next page, or `null` when there are no more pages (always
`null` for a name search).

```json
{
  "success": true,
  "exercises": [
    { "id": "exr_0292", "name": "Dumbbell Row", "image_url": "https://cdn.exercisedb.dev/Dumbbell-Row-Back.png", "target": "upper back", "body_part": "back", "equipment": "DUMBBELL" }
  ],
  "total": 1,
  "next_cursor": null
}
```

---

### GET /api/exercises/{exerciseId}/alternatives

Heuristic (no-LLM) swap suggestions for the "Find an alternative" sheet. Candidates come from the
exercise's cached `related_exercise_ids` (supplemented by a same-target search when thin), filtered
by the user's `equipment_available` and avoiding their `limitations`, each with a short templated
`why`.

#### Request

```http
GET /api/exercises/exr_0662/alternatives?limit=6&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

| Query | Type | Description |
|-------|------|-------------|
| `limit` | `number` | Max suggestions (default 6, max 20) |
| `equipment` | `string` | Override the equipment filter (else the user's available equipment) |
| `body_part` | `string` | Override the target muscle used to source candidates |

#### Response

**`200 OK`**

```json
{
  "success": true,
  "alternatives": [
    { "id": "exr_0009", "name": "Incline Push-Ups", "why": "Targets pectorals like the original", "image_url": "https://cdn.exercisedb.dev/Incline-Push-Up-Chest.png", "target": "pectorals", "equipment": "BODY WEIGHT" }
  ]
}
```

---

### POST /api/exercises/batch

Resolve many exercises in one round trip so Day Detail can render its list without N single-id
calls. Each id is served from the catalog cache. Unknown ids are omitted from the result.

#### Request

```http
POST /api/exercises/batch?code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json

{ "ids": ["exr_0662", "exr_0292", "exr_0009"] }
```

Max 50 ids per request; blanks and duplicates are dropped.

#### Response

**`200 OK`** — each item is the full `CatalogExercise` shape (see
[`GET /api/exercises/{exerciseId}`](#get-apiexercisesexerciseid)).

```json
{ "success": true, "exercises": [ { "id": "exr_0662", "name": "Push-Ups" } ] }
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | Body is not `{ ids: string[] }`, invalid JSON, or more than 50 ids |

---

### GET /api/workouts/last-performance

Return the user's most recent **completed** set for an exercise, to pre-fill the weight/reps
steppers (progressive-overload nudge). `last` is `null` when the user has never logged a completed
set for that exercise.

#### Request

```http
GET /api/workouts/last-performance?exercise_id=exr_0662&code=<FUNCTION_KEY>
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### Response

**`200 OK`**

```json
{ "success": true, "last": { "reps": 10, "weight": 5, "weight_unit": "kg", "performed_at": "2026-06-24T08:12:00Z" } }
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| `400` | `exercise_id` query param is missing |

---

## Data Models

### User Profile

Returned by `GET /api/profile`, `PATCH /api/profile`, and `PUT /api/profile`.

```typescript
interface User {
  id: string;                        // UUID (matches Supabase auth.users id)
  email: string;
  display_name: string | null;

  fitness_level: "beginner" | "intermediate" | "advanced";
  primary_goal: "weight_loss" | "muscle_gain" | "general_fitness"
              | "endurance" | "flexibility" | "stress_relief";

  fears: string[] | null;
  limitations: string[] | null;
  preferred_duration_minutes: number;
  available_days: string[] | null;
  equipment_available: string[] | null;

  coach_personality: "cheerleader" | "zen" | "analyst";

  preferred_unit_system: "metric" | "imperial";
  timezone: string;

  created_at: string;                // ISO 8601 datetime
  updated_at: string;                // ISO 8601 datetime
}
```

### Workout Plan

Returned inside `GET /api/dashboard` as `active_workout_plan`.

```typescript
interface WorkoutPlan {
  id: string;
  user_id: string;
  week_start: string;                // "YYYY-MM-DD"
  plan: WeeklyPlan;                  // See below
  is_active: boolean;
  ai_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface WeeklyPlan {
  monday?: DayPlan;
  tuesday?: DayPlan;
  wednesday?: DayPlan;
  thursday?: DayPlan;
  friday?: DayPlan;
  saturday?: DayPlan;
  sunday?: DayPlan;
}

interface DayPlan {
  is_rest_day: boolean;
  focus?: string;
  warmup?: Exercise[];
  exercises?: Exercise[];
  cooldown?: Exercise[];
  estimated_duration_minutes?: number;
  ai_notes?: string;
  manually_edited?: boolean;         // set true once the user hand-edits the day (see PATCH day)
}

interface Exercise {
  name: string;
  exercise_id?: string;              // canonical ExerciseDB v2 id (e.g. "exr_…"), when matched
  target_muscle?: string;            // ExerciseDB primary target muscle
  body_part?: string;                // ExerciseDB body part
  cues?: string[];                   // optional inline form cues
  sets?: number;
  reps?: string;                     // e.g. "10-12" or "to failure"
  duration_seconds?: number;
  rest_seconds?: number;
  notes?: string;
  target_weight?: number;            // planned working weight from the editor (0 = bodyweight)
  weight_unit?: "kg" | "lb";         // unit for target_weight, stored as sent (no conversion)
  swapped_from?: string;             // original exercise_id when the user swapped (analytics)
}
```

The `exercise_id` / `target_muscle` / `body_part` fields are **optional and additive**:
the backend fuzzy-matches each exercise name to the ExerciseDB v2 catalog (at plan generation
time **and** on every [day edit](#patch-apiworkoutsplanplaniddayday)) and stamps them when a
confident match is found. When unmatched they are absent and the app falls back to a placeholder
demo. Use `exercise_id` with [`GET /api/exercises/{exerciseId}`](#get-apiexercisesexerciseid) to
fetch demo media + instructions. The `target_weight` / `weight_unit` / `swapped_from` fields are
set by the Day Detail editor via [`PATCH /api/workouts/plan/{planId}/day/{day}`](#patch-apiworkoutsplanplaniddayday).

### Pending Insight

Returned inside `GET /api/dashboard` as `pending_insights[]`.

```typescript
interface PendingInsight {
  id: string;
  user_id: string;
  insight_type: string;              // e.g. "poor_sleep", "high_stress"
  payload: {
    ai_message: string;              // Empathetic coaching message to display
    suggested_action: string;        // Concrete next-step suggestion
    ui_action: string;               // Mobile UI hint: "show_modal" | "adjust_plan" | "open_breathing" | ...
  };
  is_consumed: boolean;
  created_at: string;
}
```

### Chat Message

Returned by `GET /api/chat/history` as `messages[]`.

```typescript
interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "model";
  content: string;
  embedding: null;                   // Omitted in API responses
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  created_at: string;
}
```
