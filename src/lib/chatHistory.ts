/**
 * Past chats: titles, one-line summaries and the week or month each one sits under.
 * Pure, so it runs in plain Node. Kept identical to the mobile app's `lib/chat-history.ts`.
 */

export interface ChatSessionLike {
  id: string;
  session_date: string;
  status: 'open' | 'closed';
  title: string | null;
  summary: string | null;
  summary_json: { one_line?: string; decisions?: string[]; commitments?: string[] } | null;
  message_count: number;
}

export interface ChatGroup<T extends ChatSessionLike> {
  title: string;
  sessions: T[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(dateISO: string): { y: number; m: number; d: number; dow: number; utc: number } {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return { y, m, d, dow: new Date(utc).getUTCDay(), utc };
}

/** The Monday of the week holding `dateISO`, as a UTC day number. */
function mondayOf(dateISO: string): number {
  const { utc, dow } = parts(dateISO);
  return utc - ((dow + 6) % 7) * 86_400_000;
}

/** "Monday 2 Nov". */
export function chatDayLabel(dateISO: string): string {
  const { m, d, dow } = parts(dateISO);
  return `${DAYS[dow]} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** The chat's title, or its day when it has none. */
export function chatTitle(s: ChatSessionLike): string {
  return s.title?.trim() || chatDayLabel(s.session_date);
}

/** One line on what came of it; null when there's nothing to say. */
export function chatSummary(s: ChatSessionLike): string | null {
  return s.summary_json?.one_line?.trim() || s.summary?.trim() || null;
}

/** "Monday 2 Nov · 14 messages"; just the count when the title is already the day. */
export function chatMeta(s: ChatSessionLike): string {
  const n = s.message_count;
  const count = `${n} ${n === 1 ? 'message' : 'messages'}`;
  return s.title?.trim() ? `${chatDayLabel(s.session_date)} · ${count}` : count;
}

/** What was decided and promised, for the top of a past chat. */
export function chatTakeaways(s: ChatSessionLike): string[] {
  return [...(s.summary_json?.decisions ?? []), ...(s.summary_json?.commitments ?? [])].filter((x) => x.trim());
}

/**
 * Today's open chat on its own (it continues in Coach), then the rest under This week,
 * Last week, or their month ("October", with the year when it isn't this one).
 */
export function groupChats<T extends ChatSessionLike>(sessions: readonly T[], todayISO: string): { today: T | null; groups: ChatGroup<T>[] } {
  const thisWeek = mondayOf(todayISO);
  const lastWeek = thisWeek - 7 * 86_400_000;
  const thisYear = parts(todayISO).y;
  let today: T | null = null;
  const groups: ChatGroup<T>[] = [];
  const sorted = [...sessions].sort((a, b) => b.session_date.localeCompare(a.session_date));
  for (const s of sorted) {
    if (!today && s.status === 'open' && s.session_date.slice(0, 10) === todayISO) {
      today = s;
      continue;
    }
    const week = mondayOf(s.session_date);
    const { y, m } = parts(s.session_date);
    const title = week >= thisWeek ? 'This week' : week === lastWeek ? 'Last week' : y === thisYear ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.sessions.push(s);
    else groups.push({ title, sessions: [s] });
  }
  return { today, groups };
}
