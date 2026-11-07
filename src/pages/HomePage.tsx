import { Check, ChevronRight, Dumbbell, Footprints, HeartPulse, Pencil, Play, Ruler, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ActivityIcon } from '@/components/ActivityRow';
import BodyMeasurementDialog, { type BodyMeasurementEntry } from '@/components/BodyMeasurementDialog';
import HealthCaptureDialog, { type HealthCaptureValues } from '@/components/HealthCaptureDialog';
import QuickActionsFab from '@/components/QuickActionsFab';
import QuickLogDialog from '@/components/QuickLogDialog';
import UserMenu from '@/components/UserMenu';
import { PendingWorkoutsCard, WorkoutResumeCard } from '@/components/WorkoutStatus';
import { Button, StatusTick, Surface } from '@/components/ui';
import {
  getDashboard,
  getHealthLog,
  getHistory,
  logActivity,
  saveBodyMeasurements,
  syncHealth,
  type ActivityItem,
  type ActivityLogPayload,
  type DashboardResponse,
  type HistoryItem,
} from '@/lib/api';
import { loadManualCapture, manualCaptureFromLog, saveManualCapture, type ManualHealthCapture } from '@/lib/health';
import {
  dateLabel,
  doneLine,
  doneTodayLabel,
  greetingFor,
  healthStats,
  homeWeek,
  isPlanDayDone,
  latestMissed,
  nextWorkout,
  recentLine,
  splitFocus,
  workoutDoneOn,
  workoutFor,
  workoutMeta,
} from '@/lib/home';
import { buildWeekPlan, completionKey, currentWeekDateForDayKey, localISODate } from '@/lib/workout';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

type ActivePlan = NonNullable<DashboardResponse['data']['active_workout_plan']>;

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** How many of the latest sessions Home lists. */
const RECENT_COUNT = 3;

function formatEmailName(email: string | null | undefined): string {
  if (!email) return '';
  const firstToken = (email.split('@')[0] ?? '').split(/[._-]/)[0] ?? '';
  return firstToken ? firstToken.charAt(0).toUpperCase() + firstToken.slice(1) : '';
}

/** Only the metrics a manual capture actually filled in. */
function snapshotFromCapture(capture: ManualHealthCapture) {
  return {
    sleep_hours: capture.sleep_hours ?? null,
    resting_heart_rate: capture.resting_heart_rate ?? null,
    step_count: capture.step_count ?? null,
    active_calories_burned: capture.active_calories_burned ?? null,
  };
}

/** Nothing captured for today: the health row invites instead of showing invented numbers. */
const EMPTY_SNAPSHOT = {
  sleep_hours: null,
  resting_heart_rate: null,
  step_count: null,
  active_calories_burned: null,
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function HomePage() {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const { healthSnapshot, setHealthSnapshot, setWeekPlan, appendMessage, profile, completedWorkouts, addXp } = useAppStore();
  const workoutDraft = useAppStore((s) => s.workoutDraft);
  const [plan, setPlan] = useState<ActivePlan | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  /** Authoritative completed dates (local `YYYY-MM-DD`) from the dashboard's `completed_days`. */
  const [serverCompletedDates, setServerCompletedDates] = useState<Set<string>>(() => new Set());
  /** When the dashboard last answered: a local done mark only counts if it's newer. */
  const [serverAnsweredAt, setServerAnsweredAt] = useState<string | null>(null);
  /** Dashboard `week_activities`: this week's activities outside guided workouts, by local date. */
  const [weekActivities, setWeekActivities] = useState<Record<string, ActivityItem[]>>({});
  /** The newest sessions, for Recent and today's done card. */
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [manualCapture, setManualCapture] = useState<ManualHealthCapture | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogSaving, setQuickLogSaving] = useState(false);
  const [quickLogError, setQuickLogError] = useState<string | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [bodySaving, setBodySaving] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!session?.access_token) return;
    const token = session.access_token;
    void getHistory(token, { limit: RECENT_COUNT })
      .then((res) => setRecent(res.items.slice(0, RECENT_COUNT)))
      .catch(() => {
        // Recent is a glance: without it, Home simply leaves it out.
      });
    try {
      const result = await getDashboard(token);
      const active = result.data.active_workout_plan;
      setPlan(active);
      setServerCompletedDates(
        new Set(
          Object.keys(result.data.completed_days ?? {}).map((dayKey) =>
            currentWeekDateForDayKey(dayKey),
          ),
        ),
      );
      setWeekActivities(result.data.week_activities ?? {});
      setServerAnsweredAt(new Date().toISOString());
      // Coach's side panel reads the week from the store.
      setWeekPlan(buildWeekPlan(active?.plan));
    } catch {
      // Non-blocking
    } finally {
      setPlanLoaded(true);
    }
  }, [session, setWeekPlan]);

  useEffect(() => {
    let mounted = true;
    const todayISO = localISODate();
    // Today's local capture (if any) shows instantly and works offline. With no capture
    // the row invites instead — the browser has no health API, and inventing numbers here
    // would put fiction in front of the user (and into the Coach/Fuel context).
    const local = user?.id ? loadManualCapture(user.id, todayISO) : null;
    setManualCapture(local);
    setHealthSnapshot(local ? snapshotFromCapture(local) : EMPTY_SNAPSHOT);

    // Authoritative, cross-device read: a capture made on any device wins over the local
    // mirror once it arrives.
    if (session?.access_token) {
      void getHealthLog(session.access_token, todayISO)
        .then((res) => {
          if (!mounted || !res.log) return;
          const capture = manualCaptureFromLog(res.log);
          if (user?.id) saveManualCapture(user.id, capture);
          setManualCapture(capture);
          setHealthSnapshot(snapshotFromCapture(capture));
        })
        .catch(() => {
          // Non-blocking — the local capture (or the empty state) already renders.
        });
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [loadDashboard, setHealthSnapshot, user?.id, session?.access_token]);

  const now = new Date();
  const todayISO = localISODate(now);
  const todayKey = DAY_KEYS[now.getDay()];
  const planDays = plan?.plan;
  const hasPlan = Boolean(planDays && Object.values(planDays).some((d) => !d.is_rest_day));
  const todayPlan = workoutFor(planDays, todayKey);

  // Server `completed_days` is authoritative (cross-device); the local mirror keeps the tick
  // instant right after finishing, before the next dashboard refresh confirms it.
  const isDayCompleted = useCallback(
    (dateISO: string) =>
      isPlanDayDone(
        dateISO,
        serverCompletedDates,
        completedWorkouts[completionKey(plan?.id, dateISO)],
        serverAnsweredAt,
        localISODate(),
      ),
    [serverCompletedDates, completedWorkouts, plan?.id, serverAnsweredAt],
  );
  const todayCompleted = isDayCompleted(todayISO);
  const doneToday = workoutDoneOn(recent, todayISO);
  const week = homeWeek(planDays, isDayCompleted, weekActivities, now);
  const missed = latestMissed(week);
  const upNext = nextWorkout(planDays, now);
  const showWeek = hasPlan || week.days.some((d) => d.otherCount > 0 || d.state === 'done');

  const logWorkout = (params: { date?: string; day?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] != null));
    navigate(`/workout/log${query.size > 0 ? `?${query.toString()}` : ''}`);
  };

  const firstName = useMemo(() => {
    return profile.display_name?.trim() || formatEmailName(user?.email);
  }, [profile.display_name, user?.email]);

  /** Shared by the health row and the FAB — both land on the same dialog. */
  const openCapture = useCallback(() => {
    setCaptureError(null);
    setCaptureOpen(true);
  }, []);

  const handleCaptureSave = async (values: HealthCaptureValues) => {
    if (captureSaving) return;
    if (!session?.access_token) {
      setCaptureError('You need to be signed in to save a health log.');
      return;
    }
    const today = localISODate();
    setCaptureSaving(true);
    setCaptureError(null);
    try {
      await syncHealth(session.access_token, { logged_date: today, ...values });
      const capture: ManualHealthCapture = {
        logged_date: today,
        ...values,
        captured_at: new Date().toISOString(),
      };
      if (user?.id) saveManualCapture(user.id, capture);
      setManualCapture(capture);
      setHealthSnapshot(snapshotFromCapture(capture));
      setCaptureOpen(false);
    } catch {
      setCaptureError('Couldn’t save your health log. Check your connection and try again.');
    } finally {
      setCaptureSaving(false);
    }
  };

  const handleBodySave = async (entry: BodyMeasurementEntry) => {
    const token = session?.access_token;
    if (!token) {
      setBodyError('Your session is missing. Sign in again and retry.');
      return;
    }
    setBodySaving(true);
    setBodyError(null);
    try {
      const { results } = await saveBodyMeasurements(token, [{ ...entry, source: 'manual' }]);
      const result = results[0];
      if (result?.outcome !== 'saved') {
        setBodyError(result?.reason ?? 'That measurement could not be saved.');
        return;
      }
      setBodyOpen(false);
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : 'Unable to save the measurement.');
    } finally {
      setBodySaving(false);
    }
  };

  /**
   * Quick-log: something the user did outside the plan. XP is awarded server-side from
   * the type (+ distance for cardio), so the response value is the only source of truth.
   */
  const handleQuickLog = async (payload: ActivityLogPayload) => {
    if (quickLogSaving) return;
    if (!session?.access_token) {
      setQuickLogError('You need to be signed in to log an activity.');
      return;
    }
    setQuickLogSaving(true);
    setQuickLogError(null);
    try {
      const result = await logActivity(session.access_token, payload);
      addXp(result.xp_earned);
      setQuickLogOpen(false);
      // The week strip and Recent show quick logs too.
      void loadDashboard();
    } catch {
      setQuickLogError('Couldn’t log that. Check your connection and try again.');
    } finally {
      setQuickLogSaving(false);
    }
  };

  const handlePlanCTA = () => {
    appendMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: 'Help me come up with an exercise plan tailored for me',
      createdAt: new Date().toISOString(),
    });
    navigate('/coach');
  };

  const stats = healthStats(healthSnapshot);

  // ── Today: one card, and the day's job comes first ──────────────────────────
  const renderToday = () => {
    if (workoutDraft) return <WorkoutResumeCard draft={workoutDraft} />;
    if (!planLoaded) {
      return (
        <Surface className="flex min-h-[180px] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        </Surface>
      );
    }
    if (!hasPlan) {
      return (
        <Surface className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-[18px] font-bold leading-6" style={{ color: 'var(--ink)' }}>
              Ready to plan your training?
            </h2>
            <p className="m-0 text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
              Tell your coach what you&rsquo;re training for, and it&rsquo;ll suggest a week that fits.
            </p>
          </div>
          <Button size="lg" fullWidth onClick={handlePlanCTA}>
            Plan with your coach
          </Button>
        </Surface>
      );
    }
    if (todayCompleted) {
      const title = splitFocus(doneToday?.title ?? todayPlan?.focus).title;
      const line = doneToday ? doneLine(doneToday) : '';
      return (
        <Surface className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--teal)' }}>
              <Check size={15} strokeWidth={3} />
              {doneToday ? doneTodayLabel(doneToday) : 'Done today'}
            </span>
            <h2 className="type-display m-0" style={{ color: 'var(--ink)' }}>
              {title}
            </h2>
            {line ? (
              <span className="text-[15px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
                {line}
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="quiet"
              className="flex-1"
              onClick={() => navigate(doneToday ? `/activities/workout/${doneToday.id}` : '/activities')}
            >
              View or edit
            </Button>
            <Button variant="quiet" className="flex-1" onClick={() => logWorkout({ day: 'none' })}>
              Log another
            </Button>
          </div>
        </Surface>
      );
    }
    if (!todayPlan) {
      return (
        <Surface className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
              Today
            </span>
            <h2 className="type-display m-0" style={{ color: 'var(--ink)' }}>
              Rest day
            </h2>
            <span className="text-[15px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
              Recovery is part of the plan. Did something anyway? Log it with the + button, and your plan stays as it is.
            </span>
          </div>
          {upNext ? (
            <button
              type="button"
              onClick={() => navigate(`/plan/${upNext.dayKey}`)}
              className="flex min-h-14 items-center justify-between gap-3 rounded-button px-4 py-2 text-left"
              style={{ background: 'var(--sunken)' }}
            >
              <span className="flex min-w-0 flex-col gap-px">
                <span className="text-[12.5px] font-medium" style={{ color: 'var(--ink-2)' }}>
                  Next up, {upNext.when}
                </span>
                <span className="truncate text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                  {upNext.title}
                  {upNext.minutes ? ` · ${upNext.minutes} min` : ''}
                </span>
              </span>
              <ChevronRight size={18} color="var(--ink-2)" className="flex-shrink-0" />
            </button>
          ) : null}
        </Surface>
      );
    }
    const meta = workoutMeta(todayPlan);
    const name = splitFocus(todayPlan.focus);
    const heroLink = 'flex min-h-11 flex-1 items-center justify-center text-[14px] font-semibold';
    return (
      <Surface tone="hero" className="flex flex-col gap-4" style={{ padding: '20px' }}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--hero-sub)' }}>
            {meta ? `Today · ${meta}` : 'Today'}
          </span>
          <h2 className="type-display m-0" style={{ color: 'var(--hero-ink)' }}>
            {name.title}
          </h2>
          {name.subtitle ? (
            <span className="text-[16px] font-medium leading-[22px]" style={{ color: 'var(--hero-sub)' }}>
              {name.subtitle}
            </span>
          ) : null}
        </div>
        {todayPlan.ai_notes ? (
          <p className="m-0 flex gap-2.5 text-[14px] leading-5" style={{ color: 'var(--hero-ink)' }}>
            <Sparkles size={18} color="var(--aqua)" fill="var(--aqua)" className="mt-px flex-shrink-0" />
            <span className="line-clamp-3">{todayPlan.ai_notes}</span>
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <Button size="lg" fullWidth leftIcon={<Play size={18} fill="var(--on-aqua)" />} onClick={() => navigate('/workout/today')}>
            Start workout
          </Button>
          <div className="flex">
            <button type="button" className={heroLink} style={{ color: 'var(--hero-ink)' }} onClick={() => navigate(`/plan/${todayKey}`)}>
              View plan
            </button>
            <button
              type="button"
              className={heroLink}
              style={{ color: 'var(--hero-ink)' }}
              onClick={() => logWorkout({ day: todayKey, date: todayISO })}
            >
              Already did it? Log it
            </button>
          </div>
        </div>
      </Surface>
    );
  };

  return (
    // Extra bottom padding keeps the last section clear of the floating log button.
    <div className="mx-auto flex w-full max-w-[680px] animate-fade-slide-up flex-col gap-6 px-4 pb-28 pt-6 sm:px-10 sm:pt-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
            {dateLabel(now)}
          </span>
          <h1 className="type-screen-title m-0" style={{ color: 'var(--ink)' }}>
            {greetingFor(now.getHours())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <UserMenu className="md:hidden" />
      </header>

      <PendingWorkoutsCard />
      {renderToday()}

      {/* This week: one strip, the plan's ticks and everything else. */}
      {showWeek ? (
        <section aria-label="This week" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
              This week
            </h2>
            {week.planned > 0 ? (
              <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
                {week.done} of {week.planned} {week.planned === 1 ? 'workout' : 'workouts'}
              </span>
            ) : null}
          </div>
          <Surface padding="12px 6px 10px">
            <div className="grid grid-cols-7">
              {week.days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-label={d.label}
                  onClick={() => navigate(`/plan/${d.dayKey}`)}
                  className="flex min-h-[66px] flex-col items-center gap-1.5 rounded-control transition-transform active:scale-[0.96]"
                >
                  <span className="text-[12px] font-semibold" style={{ color: d.isToday ? 'var(--ink)' : 'var(--ink-3)' }}>
                    {d.letter}
                  </span>
                  <span aria-hidden="true">
                    <StatusTick status={d.state} label={String(d.dayOfMonth)} otherActivity={d.otherCount > 0} />
                  </span>
                </button>
              ))}
            </div>
            {missed ? (
              <div className="mx-2.5 mt-2.5 flex items-center gap-2 pt-1.5" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="flex-1 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
                  {capitalize(missed.dayKey)}&rsquo;s {missed.title} isn&rsquo;t ticked. Did it?
                </span>
                <Button variant="link" size="sm" onClick={() => logWorkout({ date: missed.date, day: missed.dayKey })}>
                  Log it
                </Button>
              </div>
            ) : null}
          </Surface>
        </section>
      ) : null}

      {/* Health in one row: only the numbers there are. */}
      {stats.length > 0 ? (
        <Surface padding="10px 16px 16px" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
              Health
            </h2>
            <button
              type="button"
              onClick={openCapture}
              aria-label="Edit today's health numbers"
              className="flex min-h-11 items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: 'var(--ink-3)' }}
            >
              Edit
              <Pencil size={15} />
            </button>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map((stat) => (
              <div key={stat.key} className="flex min-w-0 flex-col gap-1">
                <span className="type-stat truncate" style={{ color: 'var(--ink)' }}>
                  {stat.value}
                </span>
                <span className="text-[12px] leading-4" style={{ color: 'var(--ink-3)' }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </Surface>
      ) : (
        <Surface padding="16px" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
              Let your coach see how you slept
            </h2>
            <p className="m-0 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
              Sleep, resting heart rate and steps help it adapt your training.
            </p>
          </div>
          <Button variant="quiet" className="self-start" style={{ height: 44 }} onClick={openCapture}>
            Enter today&rsquo;s numbers
          </Button>
        </Surface>
      )}

      {/* Recent: the latest few sessions. */}
      {recent.length > 0 ? (
        <section aria-label="Recent" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
              Recent
            </h2>
            <button
              type="button"
              onClick={() => navigate('/activities')}
              className="-my-3 flex min-h-11 items-center text-[13px] font-semibold"
              style={{ color: 'var(--teal)' }}
            >
              All activities
            </button>
          </div>
          <Surface padding="0" className="overflow-hidden">
            {recent.map((item, i) => {
              const line = recentLine(item, profile.preferred_unit_system, now);
              const isWorkout = item.kind === 'workout';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(isWorkout ? `/activities/workout/${item.id}` : `/activities/${item.id}`)}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
                  style={{ borderTop: i === 0 ? undefined : '1px solid var(--line)' }}
                >
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control"
                    style={{ background: isWorkout ? 'var(--tint)' : 'var(--sunken)' }}
                  >
                    {item.kind === 'workout' ? (
                      <Check size={20} strokeWidth={2.6} color="var(--teal)" />
                    ) : (
                      <ActivityIcon item={item.activity} size={20} color="var(--sky)" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[15px] font-semibold leading-5" style={{ color: 'var(--ink)' }}>
                      {line.title}
                    </span>
                    <span className="truncate text-[13px] leading-[18px]" style={{ color: 'var(--ink-3)' }}>
                      {line.meta}
                    </span>
                  </span>
                  <ChevronRight size={16} color="var(--ink-3)" className="flex-shrink-0" />
                </button>
              );
            })}
          </Surface>
        </section>
      ) : null}

      {/* Every manual capture lives on one button, so competing "Log" buttons don't pile up. */}
      <QuickActionsFab
        actions={[
          { id: 'finished-workout', label: 'Finished workout', icon: <Dumbbell size={16} color="var(--accent-text)" />, onSelect: () => logWorkout() },
          {
            id: 'activity',
            label: 'Run, class or walk',
            icon: <Footprints size={16} color="var(--accent-text)" />,
            onSelect: () => {
              setQuickLogError(null);
              setQuickLogOpen(true);
            },
          },
          {
            id: 'health',
            label: manualCapture ? 'Update health data' : 'Log health data',
            icon: <HeartPulse size={16} color="var(--accent-text)" />,
            onSelect: openCapture,
          },
          {
            id: 'body',
            label: 'Add measurement',
            icon: <Ruler size={16} color="var(--accent-text)" />,
            onSelect: () => {
              setBodyError(null);
              setBodyOpen(true);
            },
          },
        ]}
      />

      {/* Manual health capture — prefilled with today's previous entry for quick edits. */}
      {captureOpen ? (
        <HealthCaptureDialog
          initial={manualCapture}
          saving={captureSaving}
          error={captureError}
          onSave={(values) => void handleCaptureSave(values)}
          onClose={() => {
            if (!captureSaving) setCaptureOpen(false);
          }}
        />
      ) : null}

      {/* Quick log — anything done outside the plan still counts towards the week. */}
      {quickLogOpen ? (
        <QuickLogDialog
          saving={quickLogSaving}
          error={quickLogError}
          onSave={(payload) => void handleQuickLog(payload)}
          onClose={() => {
            if (!quickLogSaving) setQuickLogOpen(false);
          }}
        />
      ) : null}

      {/* Body measurement — Progress re-reads the body data when it next loads. */}
      {bodyOpen ? (
        <BodyMeasurementDialog
          initialMetric={null}
          unitSystem={profile.preferred_unit_system}
          saving={bodySaving}
          error={bodyError}
          onSave={(entry) => void handleBodySave(entry)}
          onClose={() => {
            if (!bodySaving) setBodyOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
