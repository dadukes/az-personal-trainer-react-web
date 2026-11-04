/**
 * Coach turns that outlive the stream (redesign phase 7.1). Mirrored on mobile
 * in `lib/chat-turn.ts`, with the same test cases.
 *
 * The server saves the user's message when a turn starts and finishes the turn
 * whether or not the app is still listening. So when the stream breaks, goes
 * quiet, or the page reloads mid-turn, the app follows the turn by its
 * `clientMessageId` (GET /chat/turns/{id}) instead of showing an error, and a
 * retry reuses the id so it can't start a second turn.
 */

/** How often to check on a turn the app stopped streaming. */
export const TURN_POLL_MS = 3000;

/** Give up following a turn after this long; the server marks it failed after 5 minutes. */
export const TURN_FOLLOW_LIMIT_MS = 6 * 60 * 1000;

/** The server pings every 15 s, so this long with no event means the stream is dead. */
export const STREAM_STALL_MS = 40_000;

/** After this long on one label, add a line saying it's still going. */
export const STILL_WORKING_AFTER_MS = 12_000;

/** The label while following a turn without its stream. */
export const FOLLOWING_LABEL = 'Still working on your reply';

/** A new id for a message the user sends. */
export function newClientMessageId(): string {
  return crypto.randomUUID();
}

/** The reassurance line under a label that hasn't changed for a while, or null. */
export function stillWorkingNote(sinceMs: number, nowMs: number, planBuilding: boolean): string | null {
  if (nowMs - sinceMs < STILL_WORKING_AFTER_MS) return null;
  return planBuilding ? 'Plans take the longest. Up to a minute.' : 'Still going. This can take up to a minute.';
}

/** True when a live stream has gone quiet for longer than the server's pings allow. */
export function isStreamStalled(lastActivityMs: number, nowMs: number): boolean {
  return nowMs - lastActivityMs > STREAM_STALL_MS;
}

/**
 * The turn to follow when a chat loads: the last message is the user's, and
 * its turn is still running. Returns its client id, or null.
 */
export function runningTurnInHistory(
  messages: Array<{ role: 'user' | 'model'; turn_status?: string | null; client_message_id?: string | null }>,
): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || last.turn_status !== 'running') return null;
  return last.client_message_id ?? null;
}
