import { Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { Surface } from '@/components/ui';
import ZoneBar from '@/components/ZoneBar';
import type { ProgressReport } from '@/lib/api';
import { formatExerciseName } from '@/lib/exercise';
import { addDaysISO } from '@/lib/progress';
import {
  averageWeeklyMinutes,
  dayLabel,
  formatDuration,
  liftRow,
  minutesTick,
  monthTicks,
  niceScale,
  rangeLabel,
  reportGrid,
  reportGridSummary,
  strengthTitle,
  tickLabel,
  weekRows,
  weightSeries,
  weightSub,
  zone2PlusPerWeek,
  type ReportCell,
} from '@/lib/report';
import { formatNumber, type UnitSystem } from '@/lib/units';

/**
 * The Progress reporting page's cards (Phase 9, board `WebProgress`): the KPI row, the strength
 * table, the weight chart, training time per week and the consistency grid. Every chart has a
 * hover tooltip and a table view, so no value is only reachable by hovering. One series per
 * chart, in `--series`; the grid's two marks differ by shape as well as colour.
 */

// ─── Shared pieces ────────────────────────────────────────────────────────────

/** The width a chart actually has, so its text stays at real pixel sizes. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function CardHeader({ title, sub, action }: { title: string; sub?: string | null; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="m-0 text-[17px] font-bold leading-6" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
      <div className="flex items-baseline gap-3">
        {sub ? (
          <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
            {sub}
          </span>
        ) : null}
        {action}
      </div>
    </div>
  );
}

/** Switches a chart to its table and back. */
function TableToggle({ table, onToggle, what }: { table: boolean; onToggle: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={table}
      aria-label={table ? `Show ${what} as a chart` : `Show ${what} as a table`}
      className="-my-2 inline-flex min-h-11 items-center text-[13px] font-semibold"
      style={{ color: 'var(--teal)' }}
    >
      {table ? 'Chart' : 'Table'}
    </button>
  );
}

/** `wide` spans the whole row of the page's card grid. */
function ReportCard({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <Surface
      padding="20px clamp(16px, 4vw, 24px)"
      className="flex min-w-0 flex-col gap-3"
      style={{ borderRadius: 'var(--radius-surface)', gridColumn: wide ? '1 / -1' : undefined }}
    >
      <section aria-label={label} className="flex min-w-0 flex-col gap-3">
        {children}
      </section>
    </Surface>
  );
}

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

/** One tooltip: the value leads, the label follows. Stays inside the chart. */
function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 70), Math.max(70, width - 70));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center whitespace-nowrap rounded-control px-2.5 py-1.5 shadow-md"
      style={{ left, top: tip.y - 8, background: 'var(--ink)', color: 'var(--surface)' }}
    >
      <span className="text-[14px] font-bold leading-5">{tip.value}</span>
      <span className="text-[12px] leading-4 opacity-80">{tip.label}</span>
    </div>
  );
}

const thClass = 'px-2 py-2 text-[13px] font-semibold';
const tdNum = 'type-stat px-2 py-2 text-right text-[18px]';

// ─── KPI row ──────────────────────────────────────────────────────────────────

export interface Kpi {
  label: string;
  value: string;
  sub?: string | null;
}

/** The range's headline numbers. Only the ones that have data are passed in. */
export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) return null;
  return (
    <Surface padding="20px clamp(16px, 4vw, 24px)" style={{ borderRadius: 'var(--radius-surface)' }}>
      <dl className="m-0 grid gap-x-5 gap-y-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(130px, 100%), 1fr))' }}>
        {kpis.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
              {k.label}
            </dt>
            <dd className="type-display m-0 text-[44px]" style={{ color: 'var(--ink)' }}>
              {k.value}
            </dd>
            {k.sub ? (
              <dd className="m-0 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {k.sub}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </Surface>
  );
}

// ─── Strength ─────────────────────────────────────────────────────────────────

/** Rows shown before "Show all". */
const LIFT_ROWS = 8;

export function StrengthTableCard({ strength, unitSystem }: { strength: NonNullable<ProgressReport['strength']>; unitSystem: UnitSystem }) {
  const [showAll, setShowAll] = useState(false);
  const rows = strength.lifts.map((l) => liftRow(l, unitSystem));
  const visible = showAll ? rows : rows.slice(0, LIFT_ROWS);
  const unit = unitSystem === 'imperial' ? 'lb' : 'kg';
  const hasReps = rows.some((r) => r.measure === 'reps');
  const hasLoads = rows.some((r) => r.measure === 'e1rm_kg');
  const note = hasLoads
    ? `Estimated 1-rep max in ${unit}, first session vs latest${hasReps ? '; bodyweight moves in reps' : ''}.`
    : 'Most reps in a set, first session vs latest.';
  return (
    <ReportCard label="Strength">
      <CardHeader title={strengthTitle(strength)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[290px] border-collapse text-[14.5px]">
          <thead>
            <tr style={{ color: 'var(--ink-3)' }}>
              <th className={`${thClass} pl-0 text-left`} scope="col">
                Lift
              </th>
              <th className={`${thClass} text-right`} scope="col">
                First
              </th>
              <th className={`${thClass} text-right`} scope="col">
                Latest
              </th>
              <th className={`${thClass} pr-0 text-right`} scope="col">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.name} style={{ borderTop: '1px solid var(--line)' }}>
                <th scope="row" className="py-2.5 pr-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>
                  {formatExerciseName(r.name)}
                  {r.measure === 'reps' ? (
                    <span className="ml-1.5 text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>
                      reps
                    </span>
                  ) : null}
                </th>
                <td className={tdNum} style={{ color: 'var(--ink-2)' }}>
                  {r.first}
                </td>
                <td className={tdNum} style={{ color: 'var(--ink)' }}>
                  {r.latest}
                </td>
                <td className={`${tdNum} pr-0`} style={{ color: r.direction === 'up' ? 'var(--teal)' : 'var(--ink-3)' }}>
                  {r.change}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > LIFT_ROWS ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="-mt-1 inline-flex min-h-11 items-center self-start text-[14px] font-bold"
          style={{ color: 'var(--teal)' }}
        >
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      ) : null}
      <p className="m-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        {note}
      </p>
    </ReportCard>
  );
}

// ─── Weight ───────────────────────────────────────────────────────────────────

const WEIGHT_H = 200;

export function WeightChartCard({
  weight,
  from,
  to,
  range,
  unitSystem,
  onAdd,
}: {
  weight: NonNullable<ProgressReport['weight']>;
  from: string;
  to: string;
  range: ProgressReport['range'];
  unitSystem: UnitSystem;
  onAdd: () => void;
}) {
  const [table, setTable] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const unit = unitSystem === 'imperial' ? 'lb' : 'kg';
  const series = weightSeries(weight.points, unitSystem);
  const latest = unitSystem === 'imperial' ? weight.latest_kg * 2.2046226218 : weight.latest_kg;
  const values = series.map((p) => p.value);
  const scale = niceScale(Math.min(...values), Math.max(...values), 5);

  // Geometry: y labels on the left, the end label on the right, months underneath.
  const left = 40;
  const right = 52;
  const top = 12;
  const bottom = 26;
  const plotW = Math.max(10, width - left - right);
  const plotH = WEIGHT_H - top - bottom;
  const t0 = Date.parse(`${from}T00:00:00Z`);
  const t1 = Math.max(t0 + 86_400_000, Date.parse(`${to}T00:00:00Z`));
  const x = (date: string) => left + ((Date.parse(`${date}T00:00:00Z`) - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => top + (1 - (v - scale.min) / (scale.max - scale.min)) * plotH;
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];

  // Month labels at each first of the month inside the range.
  const months: { date: string; label: string }[] = [];
  for (let d = `${from.slice(0, 7)}-01`; d <= to; d = addDaysISO(`${d.slice(0, 7)}-28`, 4).slice(0, 7) + '-01') {
    if (d >= from) months.push({ date: d, label: new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' }) });
  }
  const monthLabels: typeof months = [];
  for (const m of months) {
    const prev = monthLabels[monthLabels.length - 1];
    if (!prev || x(m.date) - x(prev.date) > 36) monthLabels.push(m);
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + left;
    let best = series[0];
    for (const p of series) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    setTip({ x: x(best.date), y: y(best.value), value: `${formatNumber(best.value)} ${unit}`, label: dayLabel(best.date, range === '1y') });
  };

  return (
    <ReportCard label="Body weight">
      <CardHeader
        title="Body weight"
        sub={weightSub(weight, unitSystem)}
        action={<TableToggle table={table} onToggle={() => setTable((v) => !v)} what="body weight" />}
      />
      <div className="flex items-end justify-between gap-3">
        <span className="type-display text-[44px]" style={{ color: 'var(--ink)' }}>
          {formatNumber(latest)} {unit}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-11 items-center gap-1 text-[14px] font-bold"
          style={{ color: 'var(--teal)' }}
          aria-label="Add a weigh-in"
        >
          <Plus size={15} strokeWidth={2.6} aria-hidden />
          Weigh-in
        </button>
      </div>
      <span className="-mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        7-day average · {weight.weigh_in_days} {weight.weigh_in_days === 1 ? 'weigh-in day' : 'weigh-in days'}
      </span>
      {table ? (
        <div className="max-h-[260px] overflow-y-auto">
          <table className="w-full border-collapse text-[14.5px]">
            <thead>
              <tr style={{ color: 'var(--ink-3)' }}>
                <th className={`${thClass} pl-0 text-left`} scope="col">
                  Day
                </th>
                <th className={`${thClass} pr-0 text-right`} scope="col">
                  Weight ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((p) => (
                <tr key={p.date} style={{ borderTop: '1px solid var(--line)' }}>
                  <th scope="row" className="py-2 text-left font-medium" style={{ color: 'var(--ink)' }}>
                    {dayLabel(p.date, true)}
                  </th>
                  <td className={`${tdNum} pr-0`} style={{ color: 'var(--ink)' }}>
                    {p.value.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative">
          {width > 0 ? (
            <svg
              role="img"
              aria-label={`Weight, daily average, over the last ${rangeLabel(range)}: ${formatNumber(series[0].value)} ${unit} on ${dayLabel(series[0].date)}, ${formatNumber(last.value)} ${unit} on ${dayLabel(last.date)}`}
              width={width}
              height={WEIGHT_H}
              className="block"
            >
              {scale.ticks.map((t) => (
                <g key={t}>
                  <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                  <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
                    {tickLabel(t)}
                  </text>
                </g>
              ))}
              {monthLabels.map((m) => (
                <text key={m.date} x={x(m.date)} y={WEIGHT_H - 6} textAnchor="middle" fontSize={12} fill="var(--ink-3)">
                  {m.label}
                </text>
              ))}
              {series.length > 1 ? (
                <path d={path} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              <circle cx={x(last.date)} cy={y(last.value)} r={4.5} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
              <text x={x(last.date) + 9} y={y(last.value) + 4} fontSize={12.5} fontWeight={700} fill="var(--ink)">
                {formatNumber(last.value)}
              </text>
              {tip ? (
                <g pointerEvents="none">
                  <line x1={tip.x} x2={tip.x} y1={top} y2={top + plotH} stroke="var(--line-strong)" strokeWidth={1} />
                  <circle cx={tip.x} cy={tip.y} r={5} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
                </g>
              ) : null}
              <rect
                x={left}
                y={top}
                width={plotW}
                height={plotH}
                fill="transparent"
                onPointerMove={onMove}
                onPointerLeave={() => setTip(null)}
              />
            </svg>
          ) : (
            <div style={{ height: WEIGHT_H }} />
          )}
          <Tooltip tip={tip} width={width} />
        </div>
      )}
    </ReportCard>
  );
}

// ─── Training time ────────────────────────────────────────────────────────────

const BARS_H = 210;

export function TrainingTimeCard({ report }: { report: ProgressReport }) {
  const [table, setTable] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const weeks = report.weeks;
  const rows = weekRows(report);
  const currentWeek = rows[0]?.weekStart;
  const most = Math.max(...weeks.map((w) => w.duration_minutes), 30);
  // Whole hours once a week reaches two; below that, clean minutes.
  const ticks = most >= 120 ? niceHourTicks(most) : niceScale(0, most, 3, true).ticks;
  const max = ticks[ticks.length - 1];
  const zones = report.cardio?.zone_minutes_per_week ?? null;
  const zone2 = zone2PlusPerWeek(report.cardio);

  const left = 44;
  const top = 10;
  const bottom = 26;
  const plotW = Math.max(10, width - left);
  const plotH = BARS_H - top - bottom;
  const slot = plotW / weeks.length;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (m: number) => top + (1 - m / max) * plotH;
  const labels = monthTicks(weeks.map((w) => w.week_start), Math.max(2, Math.ceil(40 / slot)));

  return (
    <ReportCard label="Training time per week">
      <CardHeader
        title="Training time per week"
        sub={`Average ${formatDuration(averageWeeklyMinutes(report))}`}
        action={<TableToggle table={table} onToggle={() => setTable((v) => !v)} what="training time" />}
      />
      {table ? (
        <WeekTable rows={rows} columns="time" />
      ) : (
        <div ref={ref} className="relative">
          {width > 0 ? (
            <svg
              role="img"
              aria-label={`Minutes trained per week over the last ${rangeLabel(report.range)}, averaging ${formatDuration(averageWeeklyMinutes(report))}`}
              width={width}
              height={BARS_H}
              className="block"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                  <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
                    {minutesTick(t)}
                  </text>
                </g>
              ))}
              {weeks.map((w, i) => {
                const cx = left + slot * i + slot / 2;
                const h = Math.max(0, y(0) - y(w.duration_minutes));
                const current = w.week_start === currentWeek;
                const r = Math.min(4, barW / 2, h);
                const x0 = cx - barW / 2;
                const show = () =>
                  setTip({
                    x: cx,
                    y: y(w.duration_minutes),
                    value: formatDuration(w.duration_minutes),
                    label: `${current ? 'This week so far' : `Week of ${dayLabel(w.week_start)}`} · ${w.sessions} ${w.sessions === 1 ? 'session' : 'sessions'}`,
                  });
                return (
                  <g key={w.week_start}>
                    {h > 0 ? (
                      <path
                        d={`M${x0} ${y(0)}V${y(0) - h + r}Q${x0} ${y(0) - h} ${x0 + r} ${y(0) - h}H${x0 + barW - r}Q${x0 + barW} ${y(0) - h} ${x0 + barW} ${y(0) - h + r}V${y(0)}Z`}
                        fill="var(--series)"
                        opacity={current ? 0.45 : tip && tip.x !== cx ? 0.75 : 1}
                      />
                    ) : null}
                    {/* The hit area is the whole slot, not just the painted bar. */}
                    <rect x={left + slot * i} y={top} width={slot} height={plotH} fill="transparent" onPointerEnter={show} onPointerMove={show} onPointerLeave={() => setTip(null)} />
                  </g>
                );
              })}
              <line x1={left} x2={left + plotW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />
              {labels.map((l) => (
                <text key={l.index} x={left + slot * l.index + slot / 2} y={BARS_H - 6} textAnchor="middle" fontSize={12} fill="var(--ink-3)">
                  {l.label}
                </text>
              ))}
            </svg>
          ) : (
            <div style={{ height: BARS_H }} />
          )}
          <Tooltip tip={tip} width={width} />
        </div>
      )}
      {zones && zone2 != null ? (
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            About {zone2} min / week in heart-rate zone 2 or above
          </span>
          <ZoneBar values={zones} format={(m) => `${Math.round(m)}m`} />
        </div>
      ) : null}
    </ReportCard>
  );
}

/** Ticks on whole hours: 0, 1h, 2h, 3h … with three or four steps. */
function niceHourTicks(maxMinutes: number): number[] {
  const hours = Math.ceil(maxMinutes / 60);
  const step = hours <= 4 ? 1 : hours <= 8 ? 2 : Math.ceil(hours / 4);
  const top = Math.ceil(hours / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step * 60);
}

function WeekTable({ rows, columns }: { rows: ReturnType<typeof weekRows>; columns: 'time' | 'days' }) {
  return (
    <div className="max-h-[280px] overflow-auto">
      <table className="w-full min-w-[320px] border-collapse text-[14.5px]">
        <thead>
          <tr style={{ color: 'var(--ink-3)' }}>
            <th className={`${thClass} pl-0 text-left`} scope="col">
              Week
            </th>
            {columns === 'time' ? (
              <>
                <th className={`${thClass} text-right`} scope="col">
                  Sessions
                </th>
                <th className={`${thClass} pr-0 text-right`} scope="col">
                  Time
                </th>
              </>
            ) : (
              <>
                <th className={`${thClass} text-right`} scope="col">
                  Active days
                </th>
                <th className={`${thClass} pr-0 text-right`} scope="col">
                  With a workout
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekStart} style={{ borderTop: '1px solid var(--line)' }}>
              <th scope="row" className="py-2 text-left font-medium" style={{ color: 'var(--ink)' }}>
                {r.label}
              </th>
              {columns === 'time' ? (
                <>
                  <td className={tdNum} style={{ color: 'var(--ink)' }}>
                    {r.sessions}
                  </td>
                  <td className={`${tdNum} pr-0`} style={{ color: 'var(--ink)' }}>
                    {formatDuration(r.minutes)}
                  </td>
                </>
              ) : (
                <>
                  <td className={tdNum} style={{ color: 'var(--ink)' }}>
                    {r.activeDays}
                  </td>
                  <td className={`${tdNum} pr-0`} style={{ color: 'var(--ink)' }}>
                    {r.workoutDays}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Consistency ──────────────────────────────────────────────────────────────

const DAY_LETTERS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

function cellLabel(cell: ReportCell): string {
  const day = new Date(`${cell.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const what = cell.mark === 'workout' ? 'Workout' : cell.mark === 'other' ? 'Other activity' : 'Nothing logged';
  return `${day}: ${what}`;
}

export function ConsistencyGridCard({ report }: { report: ProgressReport }) {
  const [table, setTable] = useState(false);
  const grid = reportGrid(report);
  const rows = weekRows(report);
  const elapsed = Math.round((Date.parse(`${report.to}T00:00:00Z`) - Date.parse(`${report.from}T00:00:00Z`)) / 86_400_000) + 1;
  const empty = report.days.length === 0;
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => setHover(null), [report]);
  // Past 12 weeks the grid takes the whole row; past 26 its squares get tighter.
  const wide = grid.length > 12;
  const dense = grid.length > 26;
  const cell = 26;
  const gap = dense ? 2 : 3;

  return (
    <ReportCard label="Consistency" wide={wide}>
      <CardHeader
        title="Consistency"
        sub={empty ? null : `${report.days.length} active ${report.days.length === 1 ? 'day' : 'days'} in ${elapsed}`}
        action={<TableToggle table={table} onToggle={() => setTable((v) => !v)} what="consistency" />}
      />
      {table ? (
        <WeekTable rows={rows} columns="days" />
      ) : (
        <>
          <div className="overflow-x-auto pb-1">
            {/* The day names are the grid's first column, so they line up with any cell size. */}
            <div
              role="img"
              aria-label={reportGridSummary(report)}
              className="grid grid-flow-col"
              style={{
                gap,
                gridTemplateColumns: `auto repeat(${grid.length}, minmax(8px, ${cell}px))`,
                gridTemplateRows: 'repeat(7, auto)',
              }}
            >
              {DAY_LETTERS.map((d, i) => (
                <span key={`label-${i}`} aria-hidden className="flex items-center pr-1.5 text-[11px] leading-none" style={{ color: 'var(--ink-3)' }}>
                  {d}
                </span>
              ))}
              {grid.flat().map((c) => (
                <span
                  key={c.date}
                  title={c.mark === 'future' ? undefined : cellLabel(c)}
                  onPointerEnter={() => setHover(c.date)}
                  onPointerLeave={() => setHover(null)}
                  className="flex aspect-square items-center justify-center"
                  style={{
                    borderRadius: dense ? 2 : 4,
                    background: c.mark === 'workout' ? 'var(--aqua)' : c.mark === 'future' ? 'transparent' : 'var(--sunken)',
                    boxShadow: c.today
                      ? 'inset 0 0 0 2px var(--ink)'
                      : hover === c.date && c.mark !== 'future'
                        ? 'inset 0 0 0 2px var(--line-strong)'
                        : c.mark === 'future'
                          ? 'inset 0 0 0 1px var(--line)'
                          : undefined,
                  }}
                >
                  {c.mark === 'other' ? <span className="h-[38%] w-[38%] rounded-full" style={{ background: 'var(--sky-fill)' }} /> : null}
                </span>
              ))}
            </div>
          </div>
          <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[3px]" style={{ background: 'var(--aqua)' }} />
                Workout
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--sky-fill)' }} />
                Other activity
              </span>
            </div>
            {hover ? (
              <span aria-hidden style={{ color: 'var(--ink)' }}>
                {cellLabel(grid.flat().find((c) => c.date === hover) as ReportCell)}
              </span>
            ) : null}
          </div>
          {empty ? (
            <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              Each day you train or log an activity fills its square.
            </span>
          ) : null}
        </>
      )}
    </ReportCard>
  );
}
