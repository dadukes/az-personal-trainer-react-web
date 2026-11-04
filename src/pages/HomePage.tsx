import { Activity, Calendar, Check, Dumbbell, Flame, HeartPulse, MessageCircle, Moon, Play, RotateCcw, Ruler, ShieldCheck, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import BodyMeasurementDialog, { type BodyMeasurementEntry } from '@/components/BodyMeasurementDialog';
import HealthCaptureDialog, { type HealthCaptureValues } from '@/components/HealthCaptureDialog';
import QuickActionsFab from '@/components/QuickActionsFab';
import QuickLogDialog from '@/components/QuickLogDialog';
import ScreenHeader from '@/components/ScreenHeader';
import UserMenu from '@/components/UserMenu';
import WeekActivityCard from '@/components/WeekActivityCard';
import { PendingWorkoutsCard, WorkoutResumeCard } from '@/components/WorkoutStatus';
import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import {
  getDashboard,
  getHealthLog,
  getWorkoutSessions,
  logActivity,
  saveBodyMeasurements,
  syncHealth,
  type ActivityItem,
  type ActivityLogPayload,
} from '@/lib/api';
import {
  isNativeHealthAvailable,
  loadManualCapture,
  manualCaptureFromLog,
  saveManualCapture,
  type ManualHealthCapture,
} from '@/lib/health';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { dayKeyForDate, planDayTitles, workoutsOnDate } from '@/lib/logbookPast';
import { buildWeekPlan, completionKey, currentWeekDateForDayKey, localISODate } from '@/lib/workout';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

function getTimeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatEmailName(email: string | null | undefined): string {
  if (!email) return '';
  const firstToken = (email.split('@')[0] ?? '').split(/[._-]/)[0] ?? '';
  return firstToken ? firstToken.charAt(0).toUpperCase() + firstToken.slice(1) : '';
}

/** The snapshot tiles show only the metrics a manual capture actually filled in. */
function snapshotFromCapture(capture: ManualHealthCapture) {
  return {
    sleep_hours: capture.sleep_hours ?? null,
    resting_heart_rate: capture.resting_heart_rate ?? null,
    step_count: capture.step_count ?? null,
    active_calories_burned: capture.active_calories_burned ?? null,
  };
}

/** Nothing captured for today — the tiles render `--` rather than invented numbers. */
const EMPTY_SNAPSHOT = {
  sleep_hours: null,
  resting_heart_rate: null,
  step_count: null,
  active_calories_burned: null,
};

export default function HomePage() {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const {
    healthSnapshot,
    setHealthSnapshot,
    weekPlan,
    setWeekPlan,
    appendMessage,
    profile,
    completedWorkouts,
    addXp,
  } = useAppStore();
  const workoutDraft = useAppStore((s) => s.workoutDraft);
  const [planId, setPlanId] = useState<string | undefined>();
  /** Every workout day on the plan, by day key: the week row only shows the next five. */
  const [planTitles, setPlanDayTitles] = useState<Record<string, string>>({});
  /** Authoritative completed dates (local `YYYY-MM-DD`) from the dashboard's `completed_days`. */
  const [serverCompletedDates, setServerCompletedDates] = useState<Set<string>>(() => new Set());
  /** Dashboard `week_activities`: this week's activities outside guided workouts, by local date. */
  const [weekActivities, setWeekActivities] = useState<Record<string, ActivityItem[]>>({});
  const [redoConfirm, setRedoConfirm] = useState<string | null>(null);
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
  const isNative = isNativeHealthAvailable();

  const loadDashboard = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const result = await getDashboard(session.access_token);
      const plan = result.data.active_workout_plan;
      setPlanId(plan?.id);
      setPlanDayTitles(planDayTitles(plan?.plan));
      setServerCompletedDates(
        new Set(
          Object.keys(result.data.completed_days ?? {}).map((dayKey) =>
            currentWeekDateForDayKey(dayKey),
          ),
        ),
      );
      setWeekActivities(result.data.week_activities ?? {});
      setWeekPlan(buildWeekPlan(plan?.plan));
    } catch {
      // Non-blocking
    }
  }, [session, setWeekPlan]);

  useEffect(() => {
    let mounted = true;
    const todayISO = localISODate();
    // Today's local capture (if any) shows instantly and works offline. With no capture
    // the tiles stay empty — the browser has no health API, and inventing numbers here
    // would put fiction in front of the user (and into the Coach/Fuel context).
    const local = user?.id ? loadManualCapture(user.id, todayISO) : null;
    setManualCapture(local);
    setHealthSnapshot(local ? snapshotFromCapture(local) : EMPTY_SNAPSHOT);

    // Authoritative, cross-device read (backend-gaps.md #7 is now closed): a capture
    // made on any device wins over the local mirror once it arrives.
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

  const hasPlan = weekPlan.length > 0;
  const todayWorkout = weekPlan.find((d) => d.status === 'today');

  // Server `completed_days` is authoritative (cross-device); the local mirror keeps the badge
  // instant right after finishing, before the next dashboard refresh confirms it.
  const isDayCompleted = useCallback(
    (dateISO: string) =>
      serverCompletedDates.has(dateISO) || Boolean(completedWorkouts[completionKey(planId, dateISO)]),
    [serverCompletedDates, completedWorkouts, planId],
  );
  const todayHasWorkout = Boolean(todayWorkout && todayWorkout.duration !== '-');
  const todayCompleted = todayWorkout ? isDayCompleted(todayWorkout.date) : false;

  // ── Logging afterwards (the logbook flag) ─────────────────────────────────
  const logbookOn = isFeatureEnabled('logbook');
  const logWorkout = (params: { date?: string; day?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] != null));
    navigate(`/workout/log${query.size > 0 ? `?${query.toString()}` : ''}`);
  };
  const [openingToday, setOpeningToday] = useState(false);
  const openTodaysWorkout = async () => {
    if (!session?.access_token || openingToday) return;
    setOpeningToday(true);
    try {
      const { sessions } = await getWorkoutSessions(session.access_token, 10);
      const found = workoutsOnDate(sessions, localISODate(new Date()))[0];
      navigate(found ? `/activities/workout/${found.id}` : '/activities');
    } catch {
      navigate('/activities');
    } finally {
      setOpeningToday(false);
    }
  };
  /** A past day this week whose planned workout isn't ticked: its name, for "Log it". */
  const missedPlan = (dateISO: string): string | null => {
    const title = planTitles[dayKeyForDate(dateISO)];
    return title && !isDayCompleted(dateISO) ? title : null;
  };

  const startTodayWorkout = () => {
    if (todayCompleted) {
      setRedoConfirm(todayWorkout?.key ?? 'today');
      return;
    }
    navigate('/workout/today');
  };

  const greeting = useMemo(() => {
    const storedName = profile.display_name?.trim();
    const name = storedName || formatEmailName(user?.email);
    return `${getTimeGreeting(new Date().getHours())}${name ? `, ${name}` : ''}`;
  }, [profile.display_name, user?.email]);

  /** Shared by the snapshot tiles and the FAB — both land on the same dialog. */
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
    const todayISO = localISODate();
    setCaptureSaving(true);
    setCaptureError(null);
    try {
      await syncHealth(session.access_token, { logged_date: todayISO, ...values });
      const capture: ManualHealthCapture = {
        logged_date: todayISO,
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

  /**
   * Quick-log: something the user did outside the plan. XP is awarded server-side from
   * the type (+ distance for cardio), so the response value is the only source of truth.
   */
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
      // The "This week" card lists quick logs too.
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

  const sleepLabel = healthSnapshot.sleep_hours != null ? `${healthSnapshot.sleep_hours}h` : '--';
  const hrLabel = healthSnapshot.resting_heart_rate != null ? `${healthSnapshot.resting_heart_rate} bpm` : '--';
  const stepsLabel = healthSnapshot.step_count != null ? healthSnapshot.step_count.toLocaleString() : '--';
  const calLabel =
    healthSnapshot.active_calories_burned != null ? `${healthSnapshot.active_calories_burned} kcal` : '--';

  const metrics = [
    {
      icon: <Moon size={18} color="var(--icon-sleep)" />,
      value: sleepLabel,
      label:
        healthSnapshot.sleep_hours == null
          ? 'Sleep last night'
          : healthSnapshot.sleep_hours < 6
            ? 'Sleep · Needs focus'
            : 'Sleep looks solid',
    },
    { icon: <HeartPulse size={18} color="var(--sky)" />, value: hrLabel, label: 'Resting heart rate' },
    { icon: <Activity size={18} color="var(--teal)" />, value: stepsLabel, label: 'Steps today' },
    { icon: <Flame size={18} color="var(--sky)" />, value: calLabel, label: 'Active calories' },
  ];

  return (
    // Extra bottom padding keeps the last card clear of the floating log button.
    <div className="mx-auto flex w-full max-w-[1120px] animate-fade-slide-up flex-col gap-6 p-6 pb-28 sm:p-10 sm:pb-28">
      <ScreenHeader
        title={greeting}
        subtitle="Fitness that fits you. Let's check your baseline before we move."
        rightActions={<UserMenu className="md:hidden" />}
      />

      {/* Health snapshot */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <ShieldCheck size={15} color="var(--teal)" />
            <span
              className="truncate text-[11.5px] font-bold tracking-[0.08em]"
              style={{ color: 'var(--accent-text)' }}
            >
              {manualCapture
                ? 'LOGGED TODAY'
                : isNative
                  ? 'HEALTH CONNECT SYNCED'
                  : 'HEALTH SNAPSHOT'}
            </span>
          </div>
        </div>
        {/* Each tile is the shortest path to the value it shows: tapping any of them
            opens the capture dialog (the FAB is the other way in). */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={openCapture}
              aria-label={`${manualCapture ? 'Update' : 'Log'} ${m.label.toLowerCase()}`}
              className="rounded-2xl p-4 text-left transition-transform hover:brightness-[0.98] active:scale-[0.97]"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              {m.icon}
              <div className="tabular mt-2 text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {m.value}
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {m.label}
              </div>
            </button>
          ))}
        </div>
        {/* No browser health API and nothing captured — say so instead of showing
            numbers, and point at the ways to fill them in. */}
        {!manualCapture ? (
          <p className="mt-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            Nothing logged today — tap a tile or the{' '}
            <span className="font-bold" style={{ color: 'var(--accent-text)' }}>+</span> button to add your numbers.
          </p>
        ) : null}
      </Card>

      {/* Today's plan or CTA */}
      <PendingWorkoutsCard />
      {workoutDraft ? (
        <WorkoutResumeCard draft={workoutDraft} />
      ) : hasPlan ? (
        <div className="flex flex-col gap-4 rounded-hero p-5 sm:p-7" style={{ background: 'var(--hero)' }}>
        <div className="flex items-center justify-between">
            <div className="min-w-0">
              {todayCompleted ? (
                <div
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-[0.04em]"
                  style={{ background: 'var(--forma-aqua)', color: 'var(--on-aqua)' }}
                >
                  <Check size={13} strokeWidth={3} />
                  <span>COMPLETED</span>
                </div>
              ) : (
                <div className="text-[11px] font-bold tracking-[0.08em]" style={{ color: 'var(--hero-sub)' }}>
                  TODAY&rsquo;S PLAN
                </div>
              )}
              <div className="my-1.5 text-[24px] font-extrabold" style={{ color: 'var(--hero-ink)' }}>
                {todayWorkout?.title ?? 'Rest Day'}
              </div>
              {todayHasWorkout ? (
                <div className="flex items-center gap-1.5 text-[13.5px]" style={{ color: 'var(--hero-sub)' }}>
                  <Calendar size={14} color="var(--hero-sub)" />
                  <span>{todayWorkout?.duration}</span>
                  {todayCompleted ? <span style={{ color: 'var(--hero-sub)' }}>· Nice work today</span> : null}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3.5">
              {todayWorkout ? (
                <Button
                  variant="quiet"
                  className="hidden sm:inline-flex"
                  style={{ background: 'transparent', border: '1px solid var(--hero-sub)', color: 'var(--hero-ink)' }}
                  onClick={() => navigate(`/plan/${todayWorkout.key}`)}
                >
                  View full plan
                </Button>
              ) : null}
              {todayHasWorkout ? (
                <button
                  onClick={startTodayWorkout}
                  aria-label={todayCompleted ? 'Do this workout again' : "Start today's workout"}
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
                  style={{
                    background: 'var(--forma-aqua)',
                  }}
                >
                  {todayCompleted ? (
                    <RotateCcw size={22} color="var(--on-aqua)" strokeWidth={2.6} />
                  ) : (
                    <Play size={22} color="var(--on-aqua)" fill="var(--on-aqua)" style={{ marginLeft: 2 }} />
                  )}
                </button>
              ) : null}
            </div>
        </div>
        {logbookOn && todayHasWorkout ? (
          todayCompleted ? (
            <div className="flex gap-2">
              <button
                onClick={() => void openTodaysWorkout()}
                className="h-12 flex-1 rounded-control text-[14.5px] font-bold transition-transform active:scale-[0.98]"
                style={{ background: 'var(--forma-aqua)', color: 'var(--on-aqua)' }}
              >
                {openingToday ? 'Opening…' : 'View or edit'}
              </button>
              <button
                onClick={() => logWorkout({ day: 'none' })}
                className="h-12 flex-1 rounded-control text-[14.5px] font-bold transition-transform active:scale-[0.98]"
                style={{ border: '1px solid var(--hero-sub)', color: 'var(--hero-ink)' }}
              >
                Log another
              </button>
            </div>
          ) : (
            <button
              onClick={() => logWorkout({ day: todayWorkout?.key, date: localISODate(new Date()) })}
              className="-my-2 min-h-[44px] self-start text-[14px] font-semibold"
              style={{ color: 'var(--hero-ink)' }}
            >
              Already did it? Log it
            </button>
          )
        ) : null}
        </div>
      ) : (
        <Card onClick={handlePlanCTA} className="hover:brightness-[0.99]">
          <div className="flex items-start gap-3">
            <MessageCircle size={24} color="var(--teal)" />
            <div className="flex-1">
              <div className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Ready to plan your workout?
              </div>
              <p className="mt-2 text-[14px] leading-5" style={{ color: 'var(--text-secondary)' }}>
                Let&rsquo;s jump into chat and create a personalized exercise plan tailored just for you.
              </p>
              <div
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'var(--forma-aqua)' }}
              >
                <MessageCircle size={16} color="var(--on-aqua)" />
                <span className="font-semibold" style={{ color: 'var(--on-aqua)' }}>
                  Start Planning
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Upcoming week */}
      {hasPlan ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>Upcoming week</Eyebrow>
            <Badge tone="neutral">
              <Zap size={10} color="var(--teal)" />
              AI ADAPTS DAILY
            </Badge>
          </div>
          {/* Mobile keeps the 5 days on one swipeable row (a 2-col grid leaves a ragged
              last row); from `sm` up there is room for a real grid. */}
          <div className="hide-scrollbar -mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            {weekPlan.map((day) => {
              const isToday = day.status === 'today';
              const completed = isDayCompleted(day.date);
              const otherCount = weekActivities[day.date]?.length ?? 0;
              return (
                <button
                  key={day.key}
                  onClick={() => navigate(`/plan/${day.key}`)}
                  className="relative w-[68%] flex-shrink-0 snap-start overflow-hidden rounded-[18px] p-4 text-left transition-transform active:scale-[0.98] sm:w-auto"
                  style={{
                    background: isToday ? 'var(--bg-selected)' : 'var(--bg-surface)',
                    border: `1px solid ${completed ? 'var(--accent)' : isToday ? 'var(--accent)' : 'var(--border-base)'}`,
                  }}
                >
                  {completed ? (
                    <>
                      {/* Corner "Done" ribbon */}
                      <span
                        className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-bl-[12px] px-2 py-1 text-[9.5px] font-extrabold tracking-[0.04em]"
                        style={{ background: 'var(--forma-aqua)', color: 'var(--on-aqua)' }}
                      >
                        <Check size={10} strokeWidth={3} />
                        DONE
                      </span>
                    </>
                  ) : null}
                  <div
                    className="text-[12px] font-semibold"
                    style={{ color: isToday ? 'var(--text-on-mint)' : 'var(--text-muted)' }}
                  >
                    {day.day}
                  </div>
                  <div
                    className="mt-2.5 text-[14px] font-bold"
                    style={{ color: isToday ? 'var(--text-on-mint)' : 'var(--text-primary)' }}
                  >
                    {day.title}
                  </div>
                  <div
                    className="mt-1 text-[12px]"
                    style={{ color: isToday ? 'var(--text-on-mint-soft)' : 'var(--text-muted)' }}
                  >
                    {day.duration}
                  </div>
                  {/* Activity outside the plan: its own marker, never the plan's DONE badge. */}
                  {otherCount > 0 ? (
                    <div
                      className="mt-2 flex items-center gap-1 text-[10.5px] font-semibold"
                      style={{ color: isToday ? 'var(--text-on-mint)' : 'var(--text-secondary)' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--forma-sky)' }} />
                      +{otherCount} {otherCount === 1 ? 'activity' : 'activities'}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* This week: plan ticks + everything else the user did (watch, coach, quick logs). */}
      <WeekActivityCard
        weekActivities={weekActivities}
        isPlanDone={isDayCompleted}
        unitSystem={profile.preferred_unit_system}
        onOpenActivity={(item) => navigate(item ? `/activities/${item.id}` : '/activities')}
        missedPlan={logbookOn && hasPlan ? missedPlan : undefined}
        onLogMissed={logbookOn ? (date) => logWorkout({ date, day: dayKeyForDate(date) }) : undefined}
      />

      {/* Every manual-capture flow lives on one FAB so the header and the snapshot card
          stay clean (and competing "Log" buttons don't pile up). */}
      <QuickActionsFab
        actions={[
          ...(logbookOn
            ? [{ id: 'finished-workout', label: 'Finished workout', icon: <Check size={16} color="var(--accent-text)" />, onSelect: () => logWorkout() }]
            : []),
          {
            id: 'activity',
            label: logbookOn ? 'Run, class or walk' : 'Log workout',
            icon: <Dumbbell size={16} color="var(--accent-text)" />,
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

      {/* Redo confirmation — a completed workout asks before starting again. */}
      {redoConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: 'var(--scrim)' }}
          onClick={() => setRedoConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-[24px] p-6 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-[28px]" style={{ background: 'var(--bg-selected)' }}>
              💪
            </div>
            <div className="text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Already crushed it today
            </div>
            <p className="mx-auto mt-2 max-w-[300px] text-[14px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              You&rsquo;ve already completed this workout. Want to run through it again?
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="quiet" fullWidth onClick={() => setRedoConfirm(null)}>
                Not now
              </Button>
              <Button
                fullWidth
                onClick={() => {
                  const key = redoConfirm;
                  setRedoConfirm(null);
                  navigate(`/workout/${key}`);
                }}
              >
                Do it again
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
