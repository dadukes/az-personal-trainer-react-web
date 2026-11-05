import { Check, HeartPulse, Watch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ActivityIcon } from '@/components/ActivityRow';
import ScreenHeader from '@/components/ScreenHeader';
import { Button, Row, Surface } from '@/components/ui';
import {
  activityRowMeta,
  activityTitle,
  compactDuration,
  formatDistance,
  groupByWeek,
  shortDayLabel,
  weekGroupHeader,
  workoutRowMeta,
  workoutTitle,
} from '@/lib/activities';
import { getHistory, type HistoryItem, type HistoryWeek, type ZoneModel } from '@/lib/api';
import { splitFocus } from '@/lib/home';
import { mondayOf } from '@/lib/progress';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const PAGE_SIZE = 20;

function localISODate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function WeekFigure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col-reverse gap-1">
      <dt className="type-meta" style={{ color: 'var(--ink-3)' }}>
        {label}
      </dt>
      <dd className="type-display m-0 truncate text-[44px]" style={{ color: 'var(--ink)' }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The element that scrolls the list: `AppShell`'s content pane from `md` up, the document
 * below it (null = viewport). The observer needs it as its root, or the preload margin
 * would apply to the viewport and never reach inside the pane.
 */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * `/activities` — every session, newest first: guided workouts, watch imports, coach and
 * quick logs (`GET /history`). Grouped as Today, Earlier this week, then one group per older
 * Mon–Sun week, with the whole week's totals from the server (a week split across two pages
 * still shows its real totals). Older pages
 * load as the end of the list scrolls into view, with a button as the fallback.
 */
export default function ActivitiesPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const unitSystem = useAppStore((s) => s.profile.preferred_unit_system);
  const token = session?.access_token ?? null;

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [weeks, setWeeks] = useState<Record<string, HistoryWeek>>({});
  const [zoneModel, setZoneModel] = useState<ZoneModel | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // Guards against the observer firing twice for one page.
  const inFlight = useRef(false);

  const applyPage = useCallback((page: Awaited<ReturnType<typeof getHistory>>, replace: boolean) => {
    setItems((prev) => {
      const seen = new Set(replace ? [] : prev.map((i) => i.id));
      return [...(replace ? [] : prev), ...page.items.filter((i) => !seen.has(i.id))];
    });
    setWeeks((prev) => ({ ...(replace ? {} : prev), ...Object.fromEntries(page.weeks.map((w) => [w.week_start, w])) }));
    setZoneModel(page.zone_model);
    setCursor(page.next_cursor);
  }, []);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    inFlight.current = true;
    void (async () => {
      try {
        const page = await getHistory(token, { limit: PAGE_SIZE });
        if (mounted) {
          applyPage(page, true);
          setError(null);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load your activities.');
      } finally {
        inFlight.current = false;
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, applyPage]);

  const loadMore = useCallback(async () => {
    if (!token || !cursor || inFlight.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      applyPage(await getHistory(token, { before: cursor, limit: PAGE_SIZE }), false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older activities.');
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  }, [token, cursor, applyPage]);

  // Load the next page as the end of the list approaches. Not after an error: the
  // button below retries, so a failing request doesn't loop.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: scrollParent(el), rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, error, loadMore]);

  const groups = useMemo(() => groupByWeek(items), [items]);
  const thisWeek = weeks[mondayOf(localISODate())];
  const needsBirthYear =
    !loading &&
    zoneModel == null &&
    items.some((i) => (i.kind === 'activity' ? i.activity.avg_hr : i.workout.avg_hr) != null);

  return (
    <div className="mx-auto flex w-full max-w-[680px] animate-fade-slide-up flex-col gap-5 px-4 pb-28 pt-6 sm:px-10 sm:pt-10">
      <div className="flex flex-col gap-3.5">
        <ScreenHeader title="Activities" />
        {thisWeek && thisWeek.sessions > 0 ? (
          <dl className="m-0 flex gap-2">
            <WeekFigure value={String(thisWeek.sessions)} label="Sessions this week" />
            {thisWeek.duration_minutes > 0 ? <WeekFigure value={compactDuration(thisWeek.duration_minutes)} label="Time" /> : null}
            {thisWeek.distance_km > 0 ? <WeekFigure value={formatDistance(thisWeek.distance_km, unitSystem)} label="Distance" /> : null}
          </dl>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        </div>
      ) : items.length === 0 ? (
        error ? (
          <p className="type-meta" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Watch size={26} color="var(--ink-3)" aria-hidden />
            <p className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
              Nothing logged yet
            </p>
            <p className="type-meta m-0 max-w-[340px]" style={{ color: 'var(--ink-2)' }}>
              Finish a workout, quick-log a walk or tell your coach about a class. Workouts from your watch arrive through the
              phone app. Everything you do shows up here.
            </p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          {needsBirthYear ? (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex min-h-11 items-center gap-2.5 rounded-control p-3 text-left"
              style={{ background: 'var(--sunken)' }}
            >
              <HeartPulse size={16} color="var(--ink-2)" aria-hidden />
              <span className="type-meta flex-1" style={{ color: 'var(--ink-2)' }}>
                Add your birth year to see heart-rate zones.
              </span>
              <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>
                Profile
              </span>
            </button>
          ) : null}

          {groups.map((group) => {
            const { title, totals } = weekGroupHeader(group.weekStart, weeks[group.weekStart], unitSystem);
            return (
              <section key={group.weekStart} className="flex flex-col gap-2.5" aria-label={title}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
                    {title}
                  </h2>
                  {totals ? (
                    <span className="type-meta tabular" style={{ color: 'var(--ink-3)' }}>
                      {totals}
                    </span>
                  ) : null}
                </div>
                <Surface padding="2px 0">
                  {group.items.map((item, i) => {
                    const when = shortDayLabel(item.date);
                    const isWorkout = item.kind === 'workout';
                    const xp = isWorkout ? item.workout.xp_earned : item.activity.xp_earned;
                    return (
                      <Row
                        key={item.id}
                        first={i === 0}
                        title={isWorkout ? splitFocus(workoutTitle(item.workout)).title : activityTitle(item.activity)}
                        meta={isWorkout ? workoutRowMeta(item.workout, when, unitSystem) : activityRowMeta(item.activity, when, unitSystem)}
                        leading={
                          <span
                            aria-hidden
                            className="flex h-10 w-10 flex-none items-center justify-center rounded-control"
                            style={{ background: isWorkout ? 'var(--tint)' : 'var(--sunken)' }}
                          >
                            {isWorkout ? (
                              <Check size={20} strokeWidth={2.6} color="var(--teal)" />
                            ) : (
                              <ActivityIcon item={item.activity} size={20} color="var(--sky)" />
                            )}
                          </span>
                        }
                        trailing={
                          xp > 0 ? (
                            <span className="flex-none text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                              +{xp} XP
                            </span>
                          ) : undefined
                        }
                        onClick={() => navigate(isWorkout ? `/activities/workout/${item.id}` : `/activities/${item.id}`)}
                      />
                    );
                  })}
                </Surface>
              </section>
            );
          })}

          <div ref={sentinel} />
          {error ? (
            <p className="type-meta text-center" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}
          {cursor ? (
            <div className="flex justify-center">
              <Button variant="quiet" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Loading…' : 'Load older activities'}
              </Button>
            </div>
          ) : (
            <p className="type-meta text-center" style={{ color: 'var(--ink-3)' }}>
              That&rsquo;s everything.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
