import { HeartPulse, Watch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ActivityRow from '@/components/ActivityRow';
import ScreenHeader from '@/components/ScreenHeader';
import { Button, Card } from '@/components/ui';
import WorkoutRow from '@/components/WorkoutRow';
import { groupTimeline, timelineGroupHeader } from '@/lib/activities';
import { getHistory, type HistoryItem, type HistoryWeek, type ZoneModel } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const PAGE_SIZE = 20;

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

  const groups = useMemo(() => groupTimeline(items), [items]);
  // This week's totals go on the first of its groups (Today, else Earlier this week).
  const firstThisWeek = groups.findIndex((g) => g.kind !== 'week');
  const needsBirthYear =
    !loading &&
    zoneModel == null &&
    items.some((i) => (i.kind === 'activity' ? i.activity.avg_hr : i.workout.avg_hr) != null);

  return (
    <div className="mx-auto flex w-full max-w-[760px] animate-fade-slide-up flex-col gap-6 p-6 sm:p-10">
      <ScreenHeader title="Activities" subtitle="Everything you've done, newest first." />

      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : items.length === 0 ? (
        error ? (
          <Card>
            <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
              {error}
            </p>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Watch size={24} color="var(--text-muted)" />
              <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Nothing logged yet
              </p>
              <p className="max-w-[340px] text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                Finish a guided workout, quick-log a walk, tell your coach about a class, or connect your watch on the
                phone app. Everything you do shows up here.
              </p>
            </div>
          </Card>
        )
      ) : (
        <div className="flex flex-col gap-6">
          {needsBirthYear ? (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2.5 rounded-2xl p-3 text-left text-[13px]"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
            >
              <HeartPulse size={16} color="var(--accent-text)" />
              <span className="flex-1">Add your birth year to see heart-rate zones.</span>
              <span className="font-bold" style={{ color: 'var(--accent-text)' }}>
                Profile
              </span>
            </button>
          ) : null}

          {groups.map((group, index) => {
            const { title, totals } = timelineGroupHeader(group, weeks[group.weekStart], unitSystem, index === firstThisWeek);
            return (
              <section key={group.key} className="flex flex-col gap-2.5" aria-label={title || undefined}>
                {title ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
                    <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </h2>
                    {totals ? (
                      <span className="tabular text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                        {totals}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {group.items.map((item) =>
                  item.kind === 'activity' ? (
                    <ActivityRow
                      key={item.id}
                      item={item.activity}
                      unitSystem={unitSystem}
                      when={dayLabel(item.date)}
                      onClick={() => navigate(`/activities/${item.id}`)}
                    />
                  ) : (
                    <WorkoutRow
                      key={item.id}
                      workout={item.workout}
                      unitSystem={unitSystem}
                      when={dayLabel(item.date)}
                      onClick={() => navigate(`/activities/workout/${item.id}`)}
                    />
                  ),
                )}
              </section>
            );
          })}

          <div ref={sentinel} />
          {error ? (
            <p className="text-center text-[13px]" style={{ color: 'var(--forma-danger)' }}>
              {error}
            </p>
          ) : null}
          {cursor ? (
            <div className="flex justify-center">
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Loading…' : 'Load older activities'}
              </Button>
            </div>
          ) : (
            <p className="text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
              That&rsquo;s everything.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
