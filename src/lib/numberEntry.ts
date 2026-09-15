/**
 * Parsing/formatting for typed numeric entry (`NumberEntry`, `DurationEntry`).
 *
 * Kept free of React so the rules — what a user may type, how it rounds — are easy to
 * read in one place.
 */

/** Round to `decimals` places without float noise (12.450000001 → 12.45). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** How a stored number is shown in an entry field: no trailing zeros, no float noise. */
export function formatEntryNumber(value: number, decimals: number): string {
  return String(roundTo(value, decimals));
}

/**
 * Strips anything a number field can't hold while the user types. Allows one decimal
 * separator when `decimals > 0` — either `.` or `,`, since a lot of phones in comma
 * locales only offer the comma on the decimal keypad.
 */
export function sanitizeNumberDraft(text: string, decimals: number): string {
  if (decimals <= 0) return text.replace(/\D/g, '');
  const cleaned = text.replace(/[^\d.,]/g, '');
  const sep = cleaned.search(/[.,]/);
  if (sep === -1) return cleaned;
  return cleaned.slice(0, sep + 1) + cleaned.slice(sep + 1).replace(/[.,]/g, '');
}

/** Parses a typed number (comma or dot decimal). `null` when there is nothing usable. */
export function parseNumberDraft(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Seconds → "32:45", or "1:05:30" once past the hour. */
export function formatDuration(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Seconds → its hours / minutes / seconds parts, for the three-field entry. */
export function splitDuration(totalSeconds: number): { h: number; m: number; s: number } {
  const t = Math.max(0, Math.round(totalSeconds));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
