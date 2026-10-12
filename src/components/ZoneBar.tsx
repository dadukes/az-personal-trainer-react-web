import { ZONE_LABELS } from '@/lib/activities';

interface ZoneBarProps {
  /** Z1..Z5 — seconds on an activity, minutes per week on the snapshot. */
  values: readonly number[];
  /** Formats one zone's value for the legend, e.g. `12m`. */
  format: (value: number) => string;
  compact?: boolean;
}

/**
 * Five-segment time-in-zone bar (web twin of the mobile `zone-bar`). Colour is never the
 * only signal: the legend names each zone with its value, and the bar carries one label.
 */
export default function ZoneBar({ values, format, compact = false }: ZoneBarProps) {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return null;
  const summary = values.map((v, i) => `${ZONE_LABELS[i]} ${format(v)}`).join(', ');

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={`Time in heart-rate zones: ${summary}`}
        className="flex h-2 overflow-hidden rounded-full"
        style={{ background: 'var(--bg-subtle-alt)' }}
      >
        {values.map((v, i) =>
          v > 0 ? (
            <div key={ZONE_LABELS[i]} style={{ flexGrow: v / total, background: `var(--zone-${i + 1})` }} />
          ) : null,
        )}
      </div>
      {compact ? null : (
        <div aria-hidden className="flex flex-wrap gap-x-2.5 gap-y-0.5">
          {values.map((v, i) => (
            <span key={ZONE_LABELS[i]} className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: `var(--zone-${i + 1})` }} />
              <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                {ZONE_LABELS[i]}
              </span>
              <span className="tabular">{format(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
