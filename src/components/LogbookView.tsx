import { Bike, Check, Dumbbell, Footprints, Maximize2, MoreHorizontal, Pause, Play, Plus, Sparkles, Timer, Users, Waves, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';

import Confetti from '@/components/Confetti';
import { googleSearchUrl, youtubeSearchUrl } from '@/components/ExerciseLookup';
import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { HoldBar, HoldScreen, useHoldTimer } from '@/components/HoldTimer';
import { IntervalPlayer } from '@/components/WorkoutCapture';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { Button, Segmented, Sheet } from '@/components/ui';
import { playHoldCue, prepareTimerSounds, readTimerSounds, saveTimerSounds } from '@/lib/alertSound';
import { DateTimesSheet, DeleteSheet, DiscardSheet, SourceSheet, WhenCard, shortDate } from '@/components/LogbookPast';
import {
  deleteWorkoutSession,
  getExercisesBatch,
  getLastSessions,
  getWorkoutPlan,
  patchProfile,
  updatePlanDay,
  updateWorkoutSession,
  userSafeError,
  type DashboardDayPlan,
  type ExerciseDetail,
  type ProfilePayload,
  type WorkoutSection,
  type WorkoutSessionSource,
  type WorkoutSessionSummary,
} from '@/lib/api';
import { formatExerciseName, formatMuscle, isCatalogExercise, sessionCoachAlternatives, usesWeight, type ExercisePick } from '@/lib/exercise';
import {
  addExercise,
  addSet,
  applyPlanChanges,
  carryWeight,
  exerciseSummary,
  firstOpenIndex,
  forgotFinishAt,
  lastAndRestText,
  lastTimeText,
  lastSessionsByKey,
  lastSetText,
  nextOpenIndex,
  planChanges,
  removeExercise,
  removeSet,
  sectionDone,
  sectionFoldNote,
  sectionTitle,
  seedLastSessions,
  setRounds,
  setSetValues,
  skipExercise,
  swapExercise,
  tickAll,
  tickExercise,
  tickSection,
  tickSet,
  toLogbookExercises,
  unfinishedExercises,
  workoutTally,
  type SetValues,
} from '@/lib/logbook';
import {
  dayKeyForDate,
  sessionName,
  tickedSetCount,
  timesProblem,
  toEditExercises,
  workoutsOnDate,
  type PlanDayChoice,
} from '@/lib/logbookPast';
import { countdownCue, displaySeconds, holdPosition, startHold, type HoldTimer } from '@/lib/holdTimer';
import { formatDuration, parseDurationDraft } from '@/lib/numberEntry';
import { useWakeLock } from '@/lib/wakeLock';
import { currentWeekDateForDayKey, localISODate } from '@/lib/workout';
import { resolveRestTimer } from '@/lib/workoutPrefs';
import { buildBlocks, formatClock, isCountdownBlock, isIntervalBlock, type Block } from '@/lib/workoutSession';
import { secondsUntil } from '@/lib/workoutDraft';
import { finishActiveWorkout, getActiveDraft, retryWorkoutSave } from '@/lib/workoutSync';
import { useAppStore } from '@/store/useAppStore';

const SECTIONS: WorkoutSection[] = ['warmup', 'main', 'cooldown'];
/** The API takes 50 ids a call, and no workout comes close. */
const MAX_CATALOG_IDS = 50;
const MAX_LOOKUPS = 60;

/**
 * Logging a workout afterwards, or editing a saved one. The same page as a live workout, with
 * no clock, rest or timers, the date and times at the top, and Save at the bottom. The page
 * owns the exercises and the times; this owns saving.
 */
export type LogbookPast =
  | {
      kind: 'log';
      planId?: string;
      choices: PlanDayChoice[];
      plan: Record<string, DashboardDayPlan> | null;
      /** The plan day it starts from, or null for an empty workout. */
      initialDay: string | null;
      end: Date;
      setEnd: (date: Date) => void;
      /** Recent workouts, to warn about one already on the chosen date. */
      recent: WorkoutSessionSummary[];
    }
  | {
      kind: 'edit';
      sessionId: string;
      title: string;
      end: Date;
      setEnd: (date: Date) => void;
      /** When it ended before this edit, for the day's local "done" mark. */
      originalEnd: Date;
      /** A watch recording owns the times. */
      timesLocked: boolean;
      source: WorkoutSessionSource;
      planId?: string;
      planDay: string | null;
      hasRecording: boolean;
      /** Whether anything that would be saved has changed. */
      changed: boolean;
      onClosed: (how: 'saved' | 'deleted') => void;
    };

interface LogbookViewProps {
  blocks: Block[];
  setBlocks: Dispatch<SetStateAction<Block[]>>;
  planId?: string;
  dayKey: string;
  focus?: string;
  startedAt: Date;
  setStartedAt: (date: Date) => void;
  elapsed: number;
  clientSessionId: string;
  accessToken?: string;
  askToFinish: boolean;
  finished: boolean;
  onFinished: () => void;
  exitOpen: boolean;
  onRequestExit: () => void;
  onStay: () => void;
  onLeave: () => void;
  onDiscard: () => void;
  onDone: () => void;
  /** Log or Edit. Without it, this is a workout being trained live. */
  past?: LogbookPast;
}

type OpenSheet =
  | { kind: 'menu'; blockKey: string }
  | { kind: 'info'; blockKey: string }
  | { kind: 'swap'; blockKey: string }
  | { kind: 'add' }
  | { kind: 'interval'; blockKey: string }
  | { kind: 'finish' }
  | { kind: 'forgot'; lastTick: string }
  | { kind: 'times'; from: 'finish' | 'forgot' }
  | { kind: 'when' }
  | { kind: 'source' }
  | { kind: 'delete' };

function clockText(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * The workout as a logbook: one page for everything, ticked as you go. From `lg` up every
 * exercise is open, with real inputs in Tab order and the clock in a side panel. Below that it
 * works like the phone: one exercise open, and a footer.
 *
 * The page owns the workout and writes the draft. This owns what happens on screen.
 */
export default function LogbookView({
  blocks,
  setBlocks,
  planId,
  dayKey,
  focus,
  startedAt,
  setStartedAt,
  elapsed,
  clientSessionId,
  accessToken,
  askToFinish,
  finished,
  onFinished,
  exitOpen,
  onRequestExit,
  onStay,
  onLeave,
  onDiscard,
  onDone,
  past,
}: LogbookViewProps) {
  const live = !past;
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const saveResult = useAppStore((s) => s.workoutSaveResults[clientSessionId]);
  const pendingSave = useAppStore((s) => s.workoutPending.find((p) => p.clientSessionId === clientSessionId));
  const restOn = resolveRestTimer(profile.rest_timer_enabled);
  const weightUnit = profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg';

  const [sheet, setSheet] = useState<OpenSheet | null>(askToFinish ? { kind: 'finish' } : null);
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const first = firstOpenIndex(blocks);
    return first == null ? null : blocks[first].key;
  });
  const [folded, setFolded] = useState<Partial<Record<WorkoutSection, boolean>>>({ warmup: true });
  const [tipClosed, setTipClosed] = useState(false);
  const [endOverride, setEndOverride] = useState<Date | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [timer, setTimer] = useState<HoldTimer | null>(null);
  /** The timer fills the screen until it's put away, and the bar brings it back. */
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerSoundsOn] = useState(readTimerSounds);
  const [catalog, setCatalog] = useState<Record<string, ExerciseDetail>>({});
  const [firstTimeKeys, setFirstTimeKeys] = useState<string[]>([]);
  // ── Log and Edit ──
  const [logDay, setLogDay] = useState<string | null>(() => (past?.kind === 'log' ? past.initialDay : null));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);
  const [savedPast, setSavedPast] = useState<{ start: Date; end: Date } | null>(null);
  const setTotalXp = useAppStore((s) => s.setTotalXp);
  const unmarkWorkoutCompleted = useAppStore((s) => s.unmarkWorkoutCompleted);
  const finishingRef = useRef(false);
  const dismissedTickRef = useRef<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const tally = useMemo(() => workoutTally(blocks), [blocks]);
  const pct = tally.total > 0 ? Math.round((tally.done / tally.total) * 100) : 0;
  const indexOfKey = useCallback((key: string) => blocks.findIndex((b) => b.key === key), [blocks]);

  const savePref = useCallback(
    (patch: Pick<ProfilePayload, 'rest_timer_enabled' | 'logbook_tip_seen'>) => {
      setProfile(patch);
      if (accessToken) void patchProfile(accessToken, patch).catch(() => undefined);
    },
    [accessToken, setProfile],
  );

  // Rest and timed sets count from the real clock, so a throttled tab loses nothing.
  useEffect(() => {
    if (!rest && !timer) return;
    const sync = () => setNow(Date.now());
    sync();
    const id = setInterval(sync, 500);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [rest, timer]);

  useWakeLock(Boolean(rest || timer || sheet?.kind === 'interval'));

  // ── Thumbnails, demos and how-to text, for everything on the page in one call ──────────
  const catalogIds = useMemo(
    () => Array.from(new Set(blocks.flatMap((b) => (isCatalogExercise(b.type) && b.exercise_id ? [b.exercise_id] : [])))).sort().join(','),
    [blocks],
  );
  useEffect(() => {
    const missing = catalogIds.split(',').filter((id) => id && !catalog[id]);
    if (!accessToken || missing.length === 0) return;
    let active = true;
    void (async () => {
      try {
        const { exercises } = await getExercisesBatch(accessToken, missing.slice(0, MAX_CATALOG_IDS));
        if (active) setCatalog((prev) => ({ ...prev, ...Object.fromEntries(exercises.map((e) => [e.id, e])) }));
      } catch {
        // No signal just means placeholders.
      }
    })();
    return () => {
      active = false;
    };
    // `catalog` is what this fills in, so a change to it isn't a reason to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, catalogIds]);

  // ── What each exercise did last time ───────────────────────────────────────────────────
  const lookUpLastTime = useCallback(
    (wanted: Block[]) => {
      if (!accessToken || wanted.length === 0) return;
      const list = wanted.slice(0, MAX_LOOKUPS);
      void (async () => {
        try {
          const results = await getLastSessions(accessToken, list.map((b) => ({ exercise_id: b.exercise_id ?? null, name: b.name })));
          const lastByKey = lastSessionsByKey(list, results);
          setFirstTimeKeys((prev) => [...prev, ...list.filter((b) => !lastByKey[b.key]).map((b) => b.key)]);
          if (Object.keys(lastByKey).length > 0) setBlocks((prev) => seedLastSessions(prev, lastByKey));
        } catch {
          // Background lookup: the line just doesn't show.
        }
      })();
    },
    [accessToken, setBlocks],
  );
  useEffect(() => {
    // An edit's "last time" would be this very workout, so it isn't looked up.
    if (past?.kind === 'edit') return;
    lookUpLastTime(blocks.filter((b) => !b.lastSets));
    // Once for the workout. A swap or an added exercise asks for itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rest ───────────────────────────────────────────────────────────────────────────────
  const restRemaining = rest ? secondsUntil(rest.endsAt, now) : 0;
  useEffect(() => {
    if (rest && restRemaining <= 0) setRest(null);
  }, [rest, restRemaining]);

  // Beeps for the last 3 seconds and the end, as a hold has. Its own fast check, so the list
  // doesn't redraw five times a second.
  const restEndsAt = rest?.endsAt ?? null;
  useEffect(() => {
    if (restEndsAt == null) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const at = Date.now();
      const cue = countdownCue(restEndsAt, last, at);
      last = at;
      if (cue) playHoldCue(cue, timerSoundsOn);
    }, 200);
    return () => {
      window.clearInterval(id);
      // The page's clock may end the rest a moment before this check sees it.
      if (countdownCue(restEndsAt, last, Date.now()) === 'go') playHoldCue('go', timerSoundsOn);
    };
  }, [restEndsAt, timerSoundsOn]);

  // ── A finished exercise hands over to the next ─────────────────────────────────────────
  const moveOnFrom = useCallback((after: Block[], blockIndex: number) => {
    const block = after[blockIndex];
    if (!block || block.skipped || block.sets.some((s) => !s.completed)) return;
    const next = nextOpenIndex(after, blockIndex);
    const nextKey = next == null ? null : after[next].key;
    setOpenKey(nextKey);
    if (block.section !== 'main' && sectionDone(after, block.section)) {
      setFolded((prev) => ({ ...prev, [block.section]: true }));
    }
    if (nextKey && typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      window.setTimeout(() => cardRefs.current[nextKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, []);

  const tickOneSet = useCallback(
    (blockIndex: number, setIndex: number, done: boolean, base: Block[] = blocks) => {
      const after = tickSet(base, blockIndex, setIndex, done);
      setBlocks(after);
      moveOnFrom(after, blockIndex);
      const count = workoutTally(after);
      const seconds = after[blockIndex]?.restSeconds ?? 0;
      if (live && done && restOn && seconds > 0 && !isIntervalBlock(after[blockIndex]) && count.done < count.total) {
        if (timerSoundsOn) prepareTimerSounds();
        setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
      }
    },
    [blocks, live, moveOnFrom, restOn, setBlocks, timerSoundsOn],
  );

  // ── Timed sets ─────────────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    setTimer(null);
    setTimerOpen(false);
  }, []);

  const startTimer = useCallback(
    (blockKey: string, setIndex: number) => {
      const block = blocks[indexOfKey(blockKey)];
      const seconds = block?.sets[setIndex]?.durationSeconds ?? block?.durationSeconds ?? 30;
      if (timerSoundsOn) prepareTimerSounds();
      setTimer(startHold({ blockKey, setIndex, holdSeconds: seconds, perSide: block?.isPerSide === true }, Date.now()));
      setTimerOpen(true);
      setRest(null);
    },
    [blocks, indexOfKey, timerSoundsOn],
  );

  // The full time ticks the set as planned. "Done" before then logs the time actually held.
  const finishTimer = useCallback(
    (held: number | null) => {
      if (!timer) return;
      const blockIndex = indexOfKey(timer.blockKey);
      stopTimer();
      if (blockIndex === -1) return;
      const base =
        held != null && held >= 1 && held !== timer.holdSeconds
          ? setSetValues(blocks, blockIndex, timer.setIndex, { durationSeconds: held }, false)
          : blocks;
      tickOneSet(blockIndex, timer.setIndex, true, base);
    },
    [blocks, indexOfKey, stopTimer, tickOneSet, timer],
  );

  const hold = useHoldTimer(timer, timerSoundsOn, setTimer, finishTimer);
  const holdBlock = timer ? blocks[indexOfKey(timer.blockKey)] : undefined;
  const holdName = formatExerciseName(holdBlock?.name ?? '');

  // ── Finishing ──────────────────────────────────────────────────────────────────────────
  const finishWorkout = useCallback(
    (endAt: Date) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setRest(null);
      stopTimer();
      setSheet(null);
      const seconds = Math.max(0, Math.round((endAt.getTime() - startedAt.getTime()) / 1000));
      setDurationSeconds(seconds);
      onFinished();
      void finishActiveWorkout(
        {
          clientSessionId,
          planId,
          dayKey,
          // The plan day of this week, as the server's `completed_days` counts it: Thursday's
          // workout done on Sunday ticks this week's Thursday, not next week's.
          dateISO: currentWeekDateForDayKey(dayKey),
          focus,
          payload: {
            client_session_id: clientSessionId,
            plan_id: planId,
            day: dayKey,
            started_at: startedAt.toISOString(),
            completed_at: endAt.toISOString(),
            duration_seconds: seconds,
            exercises: toLogbookExercises(blocks),
          },
        },
        accessToken,
      );
    },
    [accessToken, blocks, clientSessionId, dayKey, focus, onFinished, planId, startedAt, stopTimer],
  );

  // ── Forgot to finish: asked on return, never while someone's mid-set ───────────────────
  const checkForgot = useCallback(() => {
    const draft = getActiveDraft();
    if (!draft || finishingRef.current) return;
    const lastTick = forgotFinishAt(draft, Date.now());
    if (lastTick && dismissedTickRef.current !== lastTick) {
      setSheet((open) => open ?? { kind: 'forgot', lastTick });
    }
  }, []);
  useEffect(() => {
    if (!live) return;
    checkForgot();
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForgot();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [checkForgot, live]);

  // ── Numbers ────────────────────────────────────────────────────────────────────────────
  const setValues = useCallback(
    (blockIndex: number, setIndex: number, values: SetValues) => {
      setBlocks((prev) => setSetValues(prev, blockIndex, setIndex, values, false));
    },
    [setBlocks],
  );
  const setWeightCarried = useCallback(
    (blockIndex: number, setIndex: number, weight: number) => setBlocks((prev) => carryWeight(prev, blockIndex, setIndex, weight)),
    [setBlocks],
  );

  // ── Swaps and additions ────────────────────────────────────────────────────────────────
  const swapTo = useCallback(
    (blockIndex: number, pick: ExercisePick) => {
      const after = swapExercise(blocks, blockIndex, pick);
      setBlocks(after);
      setFirstTimeKeys((prev) => prev.filter((k) => k !== after[blockIndex].key));
      lookUpLastTime([after[blockIndex]]);
    },
    [blocks, lookUpLastTime, setBlocks],
  );

  const addTo = useCallback(
    (pick: ExercisePick) => {
      const after = addExercise(blocks, pick, weightUnit);
      setBlocks(after);
      const added = after.find((b) => !blocks.some((old) => old.key === b.key));
      if (added) {
        setOpenKey(added.key);
        lookUpLastTime([added]);
      }
    },
    [blocks, lookUpLastTime, setBlocks, weightUnit],
  );

  // ── Log: which workout ─────────────────────────────────────────────────────────────────
  const logChoice = past?.kind === 'log' && logDay ? past.choices.find((c) => c.key === logDay) : undefined;
  const pastTitle =
    past?.kind === 'edit' ? past.title : logChoice ? (logChoice.plan.focus ?? `${logChoice.key.charAt(0).toUpperCase()}${logChoice.key.slice(1)} workout`) : 'Empty workout';
  const pastEnd = past?.end ?? new Date();

  const pickSource = (key: string | null) => {
    if (past?.kind !== 'log') return;
    const choice = key ? past.choices.find((c) => c.key === key) : undefined;
    const next = choice ? buildBlocks(choice.plan, weightUnit) : [];
    setBlocks(next);
    setLogDay(choice ? choice.key : null);
    setFirstTimeKeys([]);
    setFolded({ warmup: true });
    const first = firstOpenIndex(next);
    setOpenKey(first == null ? null : next[first].key);
    lookUpLastTime(next);
    setSheet(null);
  };

  // ── Log: save. Through the same queue as a finished workout, so no signal loses nothing ──
  const saveLog = () => {
    if (past?.kind !== 'log' || finishingRef.current) return;
    finishingRef.current = true;
    const start = startedAt;
    const end = past.end;
    const dateISO = localISODate(end);
    const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    const onPlan = logDay != null && past.planId != null;
    setSavedPast({ start, end });
    setDurationSeconds(seconds);
    setSheet(null);
    onFinished();
    void finishActiveWorkout(
      {
        clientSessionId,
        planId: onPlan ? past.planId : undefined,
        dayKey: logDay ?? dayKeyForDate(dateISO),
        dateISO,
        focus: pastTitle,
        payload: {
          client_session_id: clientSessionId,
          ...(onPlan ? { plan_id: past.planId, day: logDay ?? undefined } : {}),
          started_at: start.toISOString(),
          completed_at: end.toISOString(),
          duration_seconds: seconds,
          exercises: toLogbookExercises(blocks),
        },
      },
      accessToken,
    );
  };

  // ── Edit: save the whole workout, or delete it ─────────────────────────────────────────
  const saveEdit = async () => {
    if (past?.kind !== 'edit' || !accessToken || saving) return;
    if (!past.changed) {
      past.onClosed('saved');
      return;
    }
    setSaving(true);
    setPastError(null);
    try {
      const result = await updateWorkoutSession(accessToken, past.sessionId, {
        started_at: startedAt.toISOString(),
        completed_at: past.end.toISOString(),
        exercises: toEditExercises(blocks),
      });
      setTotalXp(result.new_total_xp);
      // The day it was on may not be done any more. The server says, once Home reads again.
      unmarkWorkoutCompleted(past.planId, localISODate(past.originalEnd));
      past.onClosed('saved');
    } catch (err) {
      setSaving(false);
      setPastError(userSafeError(err, 'No connection right now. Your changes are still here, so try again in a moment.'));
    }
  };

  const deleteWorkout = async () => {
    if (past?.kind !== 'edit' || !accessToken || deleting) return;
    setDeleting(true);
    setPastError(null);
    try {
      const result = await deleteWorkoutSession(accessToken, past.sessionId);
      setTotalXp(result.new_total_xp);
      unmarkWorkoutCompleted(past.planId, localISODate(past.originalEnd));
      setSheet(null);
      past.onClosed('deleted');
    } catch (err) {
      setDeleting(false);
      setPastError(userSafeError(err, 'No connection right now, so the workout wasn\u2019t deleted. Try again in a moment.'));
    }
  };

  if (finished) {
    return (
      <LogbookSummary
        blocks={blocks}
        title={past?.kind === 'log' ? pastTitle : focus}
        dayKey={dayKey}
        planId={live ? planId : undefined}
        logged={savedPast}
        accessToken={accessToken}
        durationSeconds={durationSeconds}
        xpEarned={saveResult?.xpEarned ?? null}
        improvedNames={(saveResult?.xpBreakdown ?? []).filter((e) => e.improved).map((e) => e.name.toLowerCase())}
        watchLinked={saveResult?.watchLinked === true}
        sessionId={saveResult?.sessionId ?? null}
        saveState={saveResult ? 'saved' : pendingSave?.needsAttention ? 'refused' : pendingSave && pendingSave.attempts > 0 ? 'waiting' : 'saving'}
        saveError={pendingSave?.lastError}
        onRetrySave={accessToken ? () => void retryWorkoutSave(clientSessionId, accessToken) : undefined}
        onDone={onDone}
      />
    );
  }

  const sheetIndex = sheet && 'blockKey' in sheet ? indexOfKey(sheet.blockKey) : -1;
  const sheetBlock = sheetIndex === -1 ? null : blocks[sheetIndex];
  const allDone = tally.total > 0 && tally.done === tally.total;
  const showTip = live && profile.logbook_tip_seen === false && !tipClosed;
  const ticked = tickedSetCount(blocks);
  const problem = live ? null : timesProblem(startedAt, pastEnd, new Date());
  const sameDay = past?.kind === 'log' ? workoutsOnDate(past.recent, localISODate(pastEnd))[0] : undefined;
  const whenNotice =
    past?.kind === 'edit' && past.timesLocked
      ? 'Your watch recorded this workout, so its times stay as the watch has them.'
      : sameDay && past?.kind === 'log'
        ? `You already logged ${sessionName(sameDay, past.planId, past.plan)} on this date. Saving adds a second workout. It won\u2019t replace that one.`
        : null;
  // An app workout must keep a ticked set: removing everything is what Delete is for.
  const editNeedsTick = past?.kind === 'edit' && past.source === 'app' && ticked === 0;

  const saveBox = past ? (
    <div className="flex w-full flex-col gap-1.5">
      {pastError && sheet?.kind !== 'delete' ? (
        <p role="alert" className="text-center text-[13.5px] leading-[19px]" style={{ color: 'var(--danger)' }}>{pastError}</p>
      ) : null}
      {past.kind === 'log' ? (
        ticked > 0 && !problem ? (
          <Button fullWidth size="lg" onClick={saveLog}>Save workout · {ticked} {ticked === 1 ? 'set' : 'sets'}</Button>
        ) : (
          <Button fullWidth size="lg" variant="quiet" disabled>{problem ?? 'Tick at least one set to save'}</Button>
        )
      ) : (
        <>
          {editNeedsTick ? null : (
            <p className="text-center text-[12.5px] leading-[17px]" style={{ color: 'var(--ink-2)' }}>XP, trends and the watch link update when you save.</p>
          )}
          {editNeedsTick || problem ? (
            <Button fullWidth size="lg" variant="quiet" disabled>{problem ?? 'Tick a set, or delete the workout'}</Button>
          ) : (
            <Button fullWidth size="lg" disabled={saving} onClick={() => void saveEdit()}>{saving ? 'Saving…' : 'Save changes'}</Button>
          )}
        </>
      )}
    </div>
  ) : null;

  const restBar = rest && restRemaining > 0 ? (
    <div role="timer" aria-label={`Rest, ${restRemaining} seconds left`} style={{ background: 'var(--ink)', color: 'var(--ground)' }}>
      <div className="h-1" style={{ background: 'var(--ink-3)' }}>
        <div className="h-1" style={{ width: `${Math.min(100, Math.round((restRemaining / rest.total) * 100))}%`, background: 'var(--aqua)' }} />
      </div>
      <div className="flex items-center gap-2 py-1.5 pl-5 pr-3">
        <span className="text-[14px] font-semibold">Rest</span>
        <span className="font-number tabular flex-1 text-[30px] font-bold leading-none">{formatClock(restRemaining)}</span>
        <button
          className="min-h-[44px] px-3.5 text-[14px] font-bold"
          onClick={() => setRest({ endsAt: rest.endsAt + 15_000, total: Math.max(rest.total, restRemaining + 15) })}
        >
          +15 s
        </button>
        <button className="min-h-[44px] px-3.5 text-[14px] font-bold" onClick={() => setRest(null)}>
          Skip
        </button>
      </div>
    </div>
  ) : null;

  const holdBarView =
    hold && timer && !timerOpen ? <HoldBar controls={hold} name={holdName} perSide={timer.perSide} onOpen={() => setTimerOpen(true)} /> : null;

  const restSwitch = (
    <button
      role="switch"
      aria-checked={restOn}
      aria-label="Rest timer"
      onClick={() => {
        if (restOn) setRest(null);
        savePref({ rest_timer_enabled: !restOn });
      }}
      className="flex h-14 flex-shrink-0 flex-col justify-center rounded-2xl px-3.5 text-left"
      style={{ background: 'var(--sunken)' }}
    >
      <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Rest timer</span>
      <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>{restOn ? 'On' : 'Off'}</span>
    </button>
  );

  const finishButton = (
    <button
      onClick={() => setSheet({ kind: 'finish' })}
      className="h-14 min-w-0 flex-1 truncate rounded-2xl px-3 text-[16.5px] font-bold"
      style={{ background: allDone ? 'var(--aqua)' : 'var(--sunken)', color: allDone ? 'var(--on-aqua)' : 'var(--ink)' }}
    >
      Finish · {tally.done} of {tally.total} sets
    </button>
  );

  return (
    <div className="flex min-h-[100dvh] w-full flex-1 flex-col" style={{ background: 'var(--ground)' }}>
      <header className="sticky top-0 z-20" style={{ background: 'var(--ground)' }}>
        <div className="mx-auto flex w-full max-w-[1120px] items-center gap-1 px-2 py-1.5 lg:px-6">
          <button aria-label={live ? 'Leave workout' : 'Close without saving'} onClick={onRequestExit} className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
            <X size={22} color="var(--ink)" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center lg:items-start">
            <span className="w-full truncate text-center text-[16px] font-bold lg:text-left lg:text-[20px]" style={{ color: 'var(--ink)' }}>
              {past?.kind === 'log' ? 'Log a workout' : past?.kind === 'edit' ? 'Edit workout' : (focus ?? 'Workout')}
            </span>
            {past?.kind === 'edit' ? (
              <span className="w-full truncate text-center text-[14px] font-semibold lg:text-left" style={{ color: 'var(--ink-2)' }}>{past.title}</span>
            ) : (
              <span className={`font-number tabular text-[17px] font-semibold ${live ? 'lg:hidden' : ''}`} style={{ color: 'var(--ink-2)' }}>
                {live ? formatClock(elapsed) : `${tally.done} of ${tally.total} sets`}
              </span>
            )}
          </div>
          <button aria-label="Add an exercise" onClick={() => setSheet({ kind: 'add' })} className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
            <Plus size={22} color="var(--ink)" />
          </button>
        </div>
        <div
          role="progressbar"
          aria-valuenow={tally.done}
          aria-valuemax={tally.total}
          aria-label={`${tally.done} of ${tally.total} sets ticked`}
          className="mx-5 h-1 overflow-hidden rounded-sm lg:mx-auto lg:max-w-[1072px]"
          style={{ background: 'var(--sunken)' }}
        >
          <div className="h-1 rounded-sm transition-[width]" style={{ width: `${pct}%`, background: 'var(--aqua)' }} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1120px] flex-1 items-start gap-6 px-4 pb-6 pt-3.5 lg:px-6">
        <main className="flex min-w-0 flex-1 flex-col gap-[18px]">
          {showTip ? (
            <aside aria-label="How this page works" className="flex flex-col gap-1.5 rounded-2xl px-4 py-3.5" style={{ background: 'var(--tint)', color: 'var(--ink)' }}>
              <h2 className="text-[15px] font-bold">Your whole workout, on one page</h2>
              <p className="text-[14px] leading-5">
                See what&rsquo;s next, then train with your phone down. When you&rsquo;re back, tick it off. The next exercise opens by itself.
              </p>
              <button
                className="-mb-2 min-h-[44px] self-start text-[14px] font-bold"
                style={{ color: 'var(--teal)' }}
                onClick={() => {
                  setTipClosed(true);
                  savePref({ logbook_tip_seen: true });
                }}
              >
                Got it
              </button>
            </aside>
          ) : null}

          {past ? (
            <WhenCard
              source={past.kind === 'log' ? { label: pastTitle, onChange: () => setSheet({ kind: 'source' }) } : undefined}
              start={startedAt}
              end={pastEnd}
              onChangeTimes={past.kind === 'edit' && past.timesLocked ? null : () => setSheet({ kind: 'when' })}
              notice={whenNotice}
            />
          ) : null}

          {/* Only a plan day has a plan to tick. An empty workout is ticked as it's filled in. */}
          {past?.kind === 'log' && logDay != null && blocks.length > 0 ? (
            allDone ? (
              <p className="mx-1 flex items-center justify-between gap-3 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
                <span>All ticked. Change only what was different.</span>
                <button className="-my-3 min-h-[44px] flex-shrink-0 font-bold" style={{ color: 'var(--teal)' }} onClick={() => setBlocks((prev) => tickAll(prev, false))}>
                  Untick all
                </button>
              </p>
            ) : (
              <Button
                variant="strong"
                fullWidth
                size="lg"
                leftIcon={<Check size={18} strokeWidth={3} />}
                onClick={() => {
                  setBlocks((prev) => tickAll(prev, true));
                  setOpenKey(null);
                }}
              >
                Tick everything as planned
              </Button>
            )
          ) : null}

          {past && blocks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[20px] px-5 py-7 text-center" style={{ background: 'var(--surface)' }}>
              <h2 className="text-[18px] font-bold" style={{ color: 'var(--ink)' }}>Nothing here yet</h2>
              <p className="text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>Add what you did. Forma fills in the weights from your last time.</p>
              <Button className="mt-2" onClick={() => setSheet({ kind: 'add' })}>Add an exercise</Button>
            </div>
          ) : null}

          {SECTIONS.map((section) => {
            const indexes = blocks.flatMap((b, bi) => (b.section === section ? [bi] : []));
            if (indexes.length === 0) return null;
            const title = sectionTitle(section);
            const done = sectionDone(blocks, section);
            if (section !== 'main' && folded[section]) {
              return (
                <section key={section} aria-label={`${title}, folded`} className="flex min-h-[60px] items-stretch rounded-2xl" style={{ background: 'var(--surface)' }}>
                  <button
                    aria-expanded={false}
                    onClick={() => setFolded((prev) => ({ ...prev, [section]: false }))}
                    className="flex min-w-0 flex-1 flex-col justify-center py-2 pl-4 pr-1 text-left"
                  >
                    <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
                    <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{sectionFoldNote(blocks, section, formatExerciseName)}</span>
                  </button>
                  <button
                    aria-label={done ? `Untick ${title}` : `Tick all of ${title}`}
                    onClick={() => setBlocks((prev) => tickSection(prev, section, !done))}
                    className="flex w-[60px] flex-shrink-0 items-center justify-center"
                  >
                    <BigTick state={done ? 'done' : 'none'} />
                  </button>
                </section>
              );
            }
            return (
              <section key={section} aria-label={title} className="flex flex-col gap-2">
                <div className="mx-1 flex items-center justify-between">
                  <h2 className="text-[14px] font-bold" style={{ color: 'var(--ink-2)' }}>{title}</h2>
                  {section !== 'main' ? (
                    <button
                      aria-label={`Fold ${title}`}
                      className="-my-3 min-h-[44px] text-[13.5px] font-bold"
                      style={{ color: 'var(--teal)' }}
                      onClick={() => setFolded((prev) => ({ ...prev, [section]: true }))}
                    >
                      Fold
                    </button>
                  ) : null}
                </div>
                {indexes.map((bi) => {
                  const block = blocks[bi];
                  const detail = block.exercise_id ? catalog[block.exercise_id] : undefined;
                  const rowTimer = timer?.blockKey === block.key ? timer : null;
                  const rowPosition = rowTimer ? holdPosition(rowTimer, now) : null;
                  return (
                    <ExerciseCard
                      key={block.key}
                      cardRef={(el) => {
                        cardRefs.current[block.key] = el;
                      }}
                      block={block}
                      open={openKey === block.key}
                      thumbnail={detail ? (detail.image_url ?? detail.gif_url) : null}
                      firstTime={firstTimeKeys.includes(block.key)}
                      alternativeCount={sessionCoachAlternatives(block).length}
                      accessToken={accessToken}
                      timerSet={rowTimer?.setIndex ?? null}
                      timerRemaining={rowPosition ? displaySeconds(rowPosition) : 0}
                      timerPaused={rowPosition?.paused === true}
                      timerLabel={!rowTimer || !rowPosition ? '' : rowPosition.phase === 'switch' ? 'Switch sides' : rowTimer.perSide ? `Side ${rowPosition.side} of 2` : ''}
                      onToggle={() => setOpenKey((key) => (key === block.key ? null : block.key))}
                      onTickExercise={() => {
                        const isDone = block.sets.every((s) => s.completed) && !block.skipped;
                        const after = tickExercise(blocks, bi, !isDone);
                        setBlocks(after);
                        moveOnFrom(after, bi);
                      }}
                      onTickSet={(si) => {
                        if (isIntervalBlock(block)) {
                          const after = tickExercise(blocks, bi, !block.sets.some((s) => s.completed));
                          setBlocks(after);
                          moveOnFrom(after, bi);
                          return;
                        }
                        if (rowTimer?.setIndex === si) stopTimer();
                        tickOneSet(bi, si, !block.sets[si].completed);
                      }}
                      onValues={(si, values) => setValues(bi, si, values)}
                      onWeight={(si, weight) => setWeightCarried(bi, si, weight)}
                      onRounds={(rounds) => {
                        const after = setRounds(blocks, bi, rounds);
                        setBlocks(after);
                        moveOnFrom(after, bi);
                      }}
                      onStartTimer={live ? (si) => startTimer(block.key, si) : null}
                      onOpenTimer={() => setTimerOpen(true)}
                      onAddSet={() => setBlocks((prev) => addSet(prev, bi))}
                      onRemoveSet={() => setBlocks((prev) => removeSet(prev, bi))}
                      onInfo={() => setSheet({ kind: 'info', blockKey: block.key })}
                      onAlternatives={() => setSheet({ kind: 'swap', blockKey: block.key })}
                      onMenu={() => setSheet({ kind: 'menu', blockKey: block.key })}
                      onIntervalTimer={live ? () => setSheet({ kind: 'interval', blockKey: block.key }) : null}
                    />
                  );
                })}
              </section>
            );
          })}

          {live || blocks.length > 0 ? (
            <button
              onClick={() => setSheet({ kind: 'add' })}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-[14.5px] font-bold"
              style={{ background: 'var(--sunken)', color: 'var(--ink)' }}
            >
              <Plus size={17} /> Add an exercise
            </button>
          ) : null}

          {past?.kind === 'edit' ? (
            <button
              onClick={() => {
                setPastError(null);
                setSheet({ kind: 'delete' });
              }}
              className="min-h-[44px] text-[14.5px] font-bold"
              style={{ color: 'var(--danger)' }}
            >
              Delete this workout
            </button>
          ) : null}
        </main>

        {/* The side panel, from `lg` up. Below that the same controls sit in the footer. */}
        <aside aria-label="Workout details" className="sticky top-[72px] hidden w-[300px] flex-shrink-0 flex-col gap-3 lg:flex">
          {saveBox ? (
            <div className="flex flex-col gap-3 rounded-[20px] p-4" style={{ background: 'var(--surface)' }}>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>{tally.done} of {tally.total} sets ticked</span>
              {saveBox}
            </div>
          ) : (
          <div className="flex flex-col gap-3 rounded-[20px] p-4" style={{ background: 'var(--surface)' }}>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>Time</span>
            <span className="font-number tabular -mt-2 text-[44px] font-bold leading-none" style={{ color: 'var(--ink)' }}>{formatClock(elapsed)}</span>
            {restSwitch}
            <div className="flex">{finishButton}</div>
          </div>
          )}
          {holdBarView ? <div className="overflow-hidden rounded-2xl">{holdBarView}</div> : null}
          {restBar ? <div className="overflow-hidden rounded-2xl">{restBar}</div> : null}
          <p className="px-1 text-[13px] leading-[18px]" style={{ color: 'var(--ink-3)' }}>Press Tab to move through the numbers.</p>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 lg:hidden">
        {holdBarView}
        {restBar}
        <footer className="flex items-center gap-2 px-4 pb-3 pt-2.5" style={{ background: 'var(--ground)', borderTop: '1px solid var(--line)' }}>
          {saveBox ?? (
            <>
              {restSwitch}
              {finishButton}
            </>
          )}
        </footer>
      </div>

      {hold && timer && timerOpen ? (
        <HoldScreen
          controls={hold}
          name={holdName}
          setLabel={`Set ${timer.setIndex + 1} of ${holdBlock?.sets.length ?? 1}`}
          perSide={timer.perSide}
          onMinimise={() => setTimerOpen(false)}
          onCancel={stopTimer}
        />
      ) : null}

      {sheet?.kind === 'menu' && sheetBlock ? (
        <Sheet open title={formatExerciseName(sheetBlock.name)} onClose={() => setSheet(null)}>
          <div className="flex flex-col">
            <MenuLink label="Watch on YouTube" href={youtubeSearchUrl(sheetBlock.name)} />
            <MenuLink label="Search Google" href={googleSearchUrl(sheetBlock.name)} />
            {sheetBlock.swappedFrom ? (
              <MenuButton
                label={`Swap back to ${formatExerciseName(sheetBlock.swappedFrom)}`}
                onClick={() => {
                  if (sheetBlock.planned) swapTo(sheetIndex, sheetBlock.planned);
                  setSheet(null);
                }}
              />
            ) : null}
            <MenuButton
              label={sheetBlock.skipped ? 'Undo skip' : 'Skip today'}
              onClick={() => {
                const skipped = !sheetBlock.skipped;
                const after = skipExercise(blocks, sheetIndex, skipped);
                setBlocks(after);
                if (skipped && openKey === sheetBlock.key) {
                  const next = nextOpenIndex(after, sheetIndex);
                  setOpenKey(next == null ? null : after[next].key);
                }
                setSheet(null);
              }}
            />
            <MenuButton
              label="Remove from this workout"
              danger
              onClick={() => {
                setBlocks((prev) => removeExercise(prev, sheetIndex));
                if (openKey === sheetBlock.key) setOpenKey(null);
                setSheet(null);
              }}
            />
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === 'info' && sheetBlock ? (
        <InfoSheet
          block={sheetBlock}
          detail={sheetBlock.exercise_id ? (catalog[sheetBlock.exercise_id] ?? null) : null}
          alternativeCount={sessionCoachAlternatives(sheetBlock).length}
          accessToken={accessToken}
          onAlternatives={() => setSheet({ kind: 'swap', blockKey: sheetBlock.key })}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === 'swap' && sheetBlock ? (
        <FindAlternativeDialog
          accessToken={accessToken}
          name={sheetBlock.name}
          exerciseId={sheetBlock.exercise_id}
          coachAlternatives={sessionCoachAlternatives(sheetBlock)}
          title={`Swap ${formatExerciseName(sheetBlock.name)}`}
          subtitle={live ? 'For today only. Keeps your sets and reps.' : 'Keeps the sets and reps.'}
          onClose={() => setSheet(null)}
          onPick={(pick) => {
            setSheet(null);
            swapTo(sheetIndex, pick);
          }}
        />
      ) : null}

      {sheet?.kind === 'add' ? (
        <FindAlternativeDialog
          accessToken={accessToken}
          name=""
          mode="add"
          title="Add an exercise"
          subtitle={live ? 'For today only. Your plan stays as it is.' : 'Your plan stays as it is.'}
          onClose={() => setSheet(null)}
          onPick={(pick) => {
            setSheet(null);
            addTo(pick);
          }}
        />
      ) : null}

      {sheet?.kind === 'interval' && sheetBlock ? (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto p-4" style={{ background: 'var(--ground)' }}>
          <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-between gap-4">
            <IntervalPlayer
              block={sheetBlock}
              completed={sheetBlock.sets.map((s) => s.completed)}
              onCompleteRound={(round) => setBlocks((prev) => tickSet(prev, sheetIndex, round, true))}
              onEndEarly={() => {
                setSheet(null);
                moveOnFrom(blocks, sheetIndex);
              }}
              onLogInstead={() => setSheet(null)}
            />
            <Button
              variant="quiet"
              fullWidth
              onClick={() => {
                setSheet(null);
                moveOnFrom(blocks, sheetIndex);
              }}
            >
              Back to your workout
            </Button>
          </div>
        </div>
      ) : null}

      {sheet?.kind === 'finish' ? (
        <FinishSheet
          done={tally.done}
          total={tally.total}
          left={unfinishedExercises(blocks)}
          started={startedAt}
          end={endOverride}
          onChangeTimes={() => setSheet({ kind: 'times', from: 'finish' })}
          onTickAll={() => setBlocks((prev) => tickAll(prev, true))}
          onFinish={() => finishWorkout(endOverride ?? new Date())}
          onKeepGoing={() => {
            setEndOverride(null);
            setSheet(null);
          }}
        />
      ) : null}

      {exitOpen && past ? <DiscardSheet mode={past.kind} onKeep={onStay} onDiscard={onDiscard} /> : null}

      {sheet?.kind === 'when' ? (
        <DateTimesSheet
          start={startedAt}
          end={pastEnd}
          onClose={() => setSheet(null)}
          onDone={(from, to) => {
            setStartedAt(from);
            past?.setEnd(to);
            setSheet(null);
          }}
        />
      ) : null}

      {sheet?.kind === 'source' && past?.kind === 'log' ? (
        <SourceSheet choices={past.choices} dateDayKey={dayKeyForDate(localISODate(pastEnd))} onPick={pickSource} onClose={() => setSheet(null)} />
      ) : null}

      {sheet?.kind === 'delete' && past?.kind === 'edit' ? (
        <DeleteSheet
          sets={ticked}
          planDay={past.planDay}
          hasRecording={past.hasRecording}
          deleting={deleting}
          error={pastError}
          onDelete={() => void deleteWorkout()}
          onKeep={() => setSheet(null)}
        />
      ) : null}

      {exitOpen && live ? (
        <Sheet open title="Leave this workout?" onClose={onStay}>
          <div className="flex flex-col gap-2.5">
            <p className="mb-1.5 text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
              {tally.done > 0
                ? `Your ${tally.done} ticked ${tally.done === 1 ? 'set is' : 'sets are'} saved on this device. Pick up from Home whenever you like.`
                : 'Nothing is ticked yet. This workout is kept on this device, so you can pick up from Home.'}
            </p>
            <Button fullWidth size="lg" onClick={onLeave}>Save and come back later</Button>
            <Button
              fullWidth
              variant="quiet"
              onClick={() => {
                onStay();
                setSheet({ kind: 'finish' });
              }}
            >
              Finish workout now
            </Button>
            <button onClick={onDiscard} className="min-h-[44px] text-[15px] font-bold" style={{ color: 'var(--danger)' }}>
              Discard this workout
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === 'forgot' ? (
        <Sheet
          open
          title={`Did you finish at ${clockText(new Date(sheet.lastTick))}?`}
          onClose={() => {
            dismissedTickRef.current = sheet.lastTick;
            setSheet(null);
          }}
        >
          <div className="flex flex-col gap-2.5">
            <p className="mb-1.5 text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
              Your last tick was {agoText(Date.now() - Date.parse(sheet.lastTick))} ago. Your sets are safe, and the clock kept running.
            </p>
            <Button fullWidth size="lg" onClick={() => finishWorkout(new Date(sheet.lastTick))}>
              Yes, finish at {clockText(new Date(sheet.lastTick))}
            </Button>
            <Button
              fullWidth
              variant="quiet"
              onClick={() => {
                setEndOverride(new Date(sheet.lastTick));
                setSheet({ kind: 'times', from: 'forgot' });
              }}
            >
              Pick another time
            </Button>
            <Button
              fullWidth
              variant="link"
              onClick={() => {
                dismissedTickRef.current = sheet.lastTick;
                setSheet(null);
              }}
            >
              I&rsquo;m still training
            </Button>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === 'times' ? (
        <TimesSheet
          start={startedAt}
          end={endOverride ?? new Date()}
          onClose={() => setSheet(sheet.from === 'finish' ? { kind: 'finish' } : null)}
          onDone={(from, to) => {
            setStartedAt(from);
            setEndOverride(to);
            setSheet({ kind: 'finish' });
          }}
        />
      ) : null}
    </div>
  );
}

function agoText(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  const hourText = hours > 0 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '';
  const minuteText = rest > 0 || hours === 0 ? `${rest} ${rest === 1 ? 'minute' : 'minutes'}` : '';
  return [hourText, minuteText].filter(Boolean).join(' ');
}

function BigTick({ state, label }: { state: 'done' | 'part' | 'none'; label?: string }) {
  if (state === 'done') {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
        <Check size={20} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'part') {
    return (
      <span className="font-number flex h-9 w-9 items-center justify-center rounded-full border-2 text-[16px] font-bold" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
        {label}
      </span>
    );
  }
  return <span className="h-9 w-9 rounded-full border-2" style={{ borderColor: 'var(--ink-3)' }} />;
}

function MenuButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="min-h-[52px] text-left text-[15px] font-semibold" style={{ color: danger ? 'var(--danger)' : 'var(--ink)' }}>
      {label}
    </button>
  );
}

function MenuLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
      {label}
    </a>
  );
}

// ─── One exercise ────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  cardRef: (el: HTMLElement | null) => void;
  block: Block;
  open: boolean;
  thumbnail: string | null;
  firstTime: boolean;
  alternativeCount: number;
  accessToken?: string;
  timerSet: number | null;
  timerRemaining: number;
  timerPaused: boolean;
  timerLabel: string;
  onToggle: () => void;
  onTickExercise: () => void;
  onTickSet: (setIndex: number) => void;
  onValues: (setIndex: number, values: SetValues) => void;
  onWeight: (setIndex: number, weight: number) => void;
  onRounds: (rounds: number) => void;
  /** Null when logging afterwards or editing: there's no timer to run. */
  onStartTimer: ((setIndex: number) => void) | null;
  onOpenTimer: () => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onInfo: () => void;
  onAlternatives: () => void;
  onMenu: () => void;
  onIntervalTimer: (() => void) | null;
}

function ExerciseCard({
  cardRef,
  block,
  open,
  thumbnail,
  firstTime,
  alternativeCount,
  accessToken,
  timerSet,
  timerRemaining,
  timerPaused,
  timerLabel,
  onToggle,
  onTickExercise,
  onTickSet,
  onValues,
  onWeight,
  onRounds,
  onStartTimer,
  onOpenTimer,
  onAddSet,
  onRemoveSet,
  onInfo,
  onAlternatives,
  onMenu,
  onIntervalTimer,
}: ExerciseCardProps) {
  const name = formatExerciseName(block.name);
  const done = block.sets.filter((s) => s.completed).length;
  const allDone = done === block.sets.length && block.sets.length > 0 && !block.skipped;
  const catalog = isCatalogExercise(block.type);
  const noMatch = catalog && !block.exercise_id;
  const interval = isIntervalBlock(block);
  const live = onStartTimer != null;
  const tag = block.swappedFrom
    ? `Swapped from ${formatExerciseName(block.swappedFrom)}${live ? ' for today' : ''}`
    : block.addedToday
      ? live
        ? 'Added today'
        : 'Not on the plan'
      : null;
  const showFirstTime = firstTime && usesWeight(block.type) && block.sets.every((s) => s.weight <= 0);
  // Rest gets its own colour, so it's easy to find next to "Last time".
  const line = showFirstTime ? 'First time. Pick a weight you can control.' : interval ? lastAndRestText(block) : lastTimeText(block);
  const restLine = !interval && block.restSeconds > 0 ? `Rest ${block.restSeconds} s` : null;
  const FallbackIcon =
    block.type === 'class'
      ? Users
      : block.type === 'cardio'
        ? block.activityKind === 'cycle'
          ? Bike
          : block.activityKind === 'swim'
            ? Waves
            : Footprints
        : isCountdownBlock(block)
          ? Timer
          : Dumbbell;

  return (
    <article ref={cardRef} aria-label={name} className="scroll-mt-20 rounded-2xl" style={{ background: 'var(--surface)' }}>
      <div className="flex min-h-[64px] items-stretch">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1 text-left lg:cursor-default"
        >
          <Thumb src={thumbnail} Fallback={FallbackIcon} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className="text-[15.5px] font-bold leading-5"
              style={{ color: block.skipped ? 'var(--ink-3)' : 'var(--ink)', textDecoration: block.skipped ? 'line-through' : 'none' }}
            >
              {name}
            </span>
            <span className="text-[13px] leading-[18px]" style={{ color: 'var(--ink-3)' }}>{exerciseSummary(block)}</span>
            {tag ? <span className="text-[12.5px] font-bold leading-[17px]" style={{ color: 'var(--sky)' }}>{tag}</span> : null}
          </span>
        </button>
        <button
          aria-label={allDone ? `Untick all sets of ${name}` : `Tick all sets of ${name}`}
          onClick={onTickExercise}
          className="flex w-[60px] flex-shrink-0 items-center justify-center"
        >
          <BigTick state={allDone ? 'done' : done > 0 && !block.skipped ? 'part' : 'none'} label={`${done}/${block.sets.length}`} />
        </button>
      </div>

      {/* Every exercise stays open on a wide screen, so Tab can run through all the numbers. */}
      <div className={`${open ? 'flex' : 'hidden'} flex-col gap-2.5 px-3 pb-3 lg:flex`}>
        {catalog && block.exercise_id ? (
          <div className={open ? '' : 'hidden'}>
            <ExerciseDemo exerciseId={block.exercise_id} name={block.name} accessToken={accessToken} onCues={() => undefined} showName={false} heightClass="h-[168px]" />
          </div>
        ) : null}
        {noMatch ? (
          <a
            href={youtubeSearchUrl(block.name)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-bold"
            style={{ background: 'var(--ink)', color: 'var(--ground)' }}
          >
            <Play size={16} fill="currentColor" /> Watch on YouTube
          </a>
        ) : null}

        <div className="flex gap-1.5">
          {catalog && block.exercise_id ? <CardButton label="How-to" onClick={onInfo} grow="flex-[1]" /> : null}
          {catalog ? <CardButton label={alternativeCount > 0 ? `Alternatives · ${alternativeCount}` : 'Alternatives'} onClick={onAlternatives} grow="flex-[1.6]" /> : null}
          <button
            aria-label={`More for ${name}: YouTube, Google, skip, remove`}
            onClick={onMenu}
            className="ml-auto flex h-11 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--sunken)', color: 'var(--ink)' }}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>

        {block.notes && !block.swappedFrom ? (
          <p className="mx-1 flex gap-2 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink)' }}>
            <Sparkles size={16} color="var(--teal)" className="mt-0.5 flex-shrink-0" />
            <span>{block.notes}</span>
          </p>
        ) : null}
        {line || restLine ? (
          <span className="mx-1 text-[13px] leading-[18px]" style={{ color: 'var(--ink-3)' }}>
            {line}
            {line && restLine ? ' · ' : ''}
            {restLine ? <span className="text-[13.5px] font-bold" style={{ color: 'var(--teal)' }}>{restLine}</span> : null}
          </span>
        ) : null}

        {interval && onIntervalTimer ? (
          <button
            onClick={onIntervalTimer}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-bold"
            style={{ background: 'var(--sunken)', color: 'var(--ink)' }}
          >
            <Play size={15} fill="currentColor" /> Open the interval timer
          </button>
        ) : null}

        <SetTable
          block={block}
          timerSet={timerSet}
          timerRemaining={timerRemaining}
          timerPaused={timerPaused}
          onTickSet={onTickSet}
          onValues={onValues}
          onWeight={onWeight}
          onRounds={onRounds}
          onStartTimer={onStartTimer}
          onOpenTimer={onOpenTimer}
        />
        {timerLabel ? <span className="mx-1 text-[13px] font-bold" style={{ color: 'var(--teal)' }}>{timerLabel}</span> : null}

        {!interval && block.type !== 'cardio' && block.type !== 'class' ? (
          <div className="mx-1 flex justify-between gap-2">
            <button onClick={onAddSet} className="min-h-[44px] text-[14px] font-bold" style={{ color: 'var(--teal)' }}>+ Add set</button>
            {block.sets.length > 1 ? (
              <button onClick={onRemoveSet} className="min-h-[44px] text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }}>Remove last set</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Thumb({ src, Fallback }: { src: string | null; Fallback: typeof Dumbbell }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const show = src && src !== failed;
  // White only under a picture that has arrived, so a slow download doesn't look blank.
  const loaded = show && src === loadedSrc;
  return (
    <span
      aria-hidden="true"
      className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] ${loaded ? 'bg-white' : ''}`}
      style={{ border: '1px solid var(--line)', background: loaded ? undefined : 'var(--sunken)' }}
    >
      {loaded ? null : <Fallback size={20} color="var(--ink-3)" />}
      {show ? (
        <img src={src} alt="" loading="lazy" onLoad={() => setLoadedSrc(src)} onError={() => setFailed(src)} className="absolute inset-0 h-full w-full object-contain" />
      ) : null}
    </span>
  );
}

function CardButton({ label, onClick, grow }: { label: string; onClick: () => void; grow: string }) {
  return (
    <button onClick={onClick} className={`h-11 min-w-0 ${grow} truncate rounded-xl px-2 text-[14px] font-bold`} style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
      {label}
    </button>
  );
}

// ─── The sets ────────────────────────────────────────────────────────────────

/**
 * A typed number. It keeps its own text while focused, so "12." can become "12.5", and saves
 * as it leaves the field. Blank is allowed, because a blank weight is a real answer.
 */
function NumberCell({
  value,
  label,
  onCommit,
  decimals,
  done,
}: {
  value: number;
  label: string;
  onCommit: (next: number) => void;
  decimals: boolean;
  done: boolean;
}) {
  const shown = value > 0 ? trimNumber(value) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    setDraft(null);
    if (next !== value) onCommit(decimals ? next : Math.round(next));
  };
  return (
    <input
      aria-label={label}
      inputMode={decimals ? 'decimal' : 'numeric'}
      value={draft ?? shown}
      placeholder="Add"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="font-number tabular h-11 w-full min-w-0 rounded-[10px] text-center text-[24px] font-bold outline-none placeholder:text-[18px] focus:ring-2"
      style={{ background: done ? 'transparent' : 'var(--ground)', color: done ? 'var(--ink)' : 'var(--ink-2)' }}
    />
  );
}

/** A run or class's time, typed as 32:45 or 1:05:30. A plain number is minutes. */
function TimeCell({ seconds, label, onCommit, done }: { seconds: number; label: string; onCommit: (next: number) => void; done: boolean }) {
  const shown = seconds > 0 ? formatDuration(seconds) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const next = parseDurationDraft(draft);
    setDraft(null);
    if (next != null && next !== seconds) onCommit(next);
  };
  return (
    <input
      aria-label={`${label}, as minutes:seconds`}
      // A text keyboard: a phone's number pad has no colon.
      autoComplete="off"
      value={draft ?? shown}
      placeholder="mm:ss"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d:.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="font-number tabular h-11 w-full min-w-0 rounded-[10px] text-center text-[24px] font-bold outline-none placeholder:text-[18px] focus:ring-2"
      style={{ background: done ? 'transparent' : 'var(--ground)', color: done ? 'var(--ink)' : 'var(--ink-2)' }}
    />
  );
}

function SetTick({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-pressed={done} aria-label={label} onClick={onClick} className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
      {done ? (
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
          <Check size={17} strokeWidth={3.2} />
        </span>
      ) : (
        <span className="h-[30px] w-[30px] rounded-full border-2" style={{ borderColor: 'var(--ink-3)' }} />
      )}
    </button>
  );
}

function Row({ n, done, last, children, tick }: { n: number; done: boolean; last: string; children: ReactNode; tick: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center gap-2 rounded-xl pl-2" style={{ background: done ? 'var(--tint)' : 'transparent' }}>
      <span className="font-number tabular w-[22px] flex-shrink-0 text-[18px] font-semibold" style={{ color: 'var(--ink-3)' }}>{n}</span>
      <span className="tabular hidden w-[92px] flex-shrink-0 truncate text-[13px] lg:block" style={{ color: 'var(--ink-3)' }}>{last}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {tick}
    </div>
  );
}

function Headings({ first, second }: { first: string; second?: string }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-2 pl-2 text-[12px] font-semibold" style={{ color: 'var(--ink-3)' }}>
      <span className="w-[22px] flex-shrink-0">Set</span>
      <span className="hidden w-[92px] flex-shrink-0 lg:block">Last time</span>
      <span className="flex-1 text-center">{first}</span>
      {second ? <span className="flex-1 text-center">{second}</span> : null}
      <span className="w-11 flex-shrink-0" />
    </div>
  );
}

interface SetTableProps {
  block: Block;
  timerSet: number | null;
  timerRemaining: number;
  timerPaused: boolean;
  onTickSet: (setIndex: number) => void;
  onValues: (setIndex: number, values: SetValues) => void;
  onWeight: (setIndex: number, weight: number) => void;
  onRounds: (rounds: number) => void;
  onStartTimer: ((setIndex: number) => void) | null;
  onOpenTimer: () => void;
}

function SetTable({ block, timerSet, timerRemaining, timerPaused, onTickSet, onValues, onWeight, onRounds, onStartTimer, onOpenTimer }: SetTableProps) {
  const unit = block.weightUnit === 'lb' ? 'Lb' : 'Kg';
  const name = formatExerciseName(block.name);
  const lastOf = (i: number) => lastSetText(block.lastSets?.[i]);

  if (isIntervalBlock(block)) {
    const done = block.sets.filter((s) => s.completed).length;
    return (
      <div className="flex flex-col gap-1">
        <Headings first="Rounds" />
        <Row n={1} done={done > 0} last={block.lastSets ? `${block.lastSets.length} rounds` : '–'} tick={<SetTick done={done > 0} label={done > 0 ? 'Rounds done, select to untick' : 'Tick all rounds as done'} onClick={() => onTickSet(0)} />}>
          <NumberCell value={done > 0 ? done : block.sets.length} label={`Rounds, ${name}`} decimals={false} done={done > 0} onCommit={(n) => onRounds(Math.min(n, block.sets.length))} />
        </Row>
      </div>
    );
  }

  if (block.type === 'cardio' || block.type === 'class') {
    const set = block.sets[0];
    return (
      <div className="flex flex-col gap-1">
        <Headings first="Time" second={block.type === 'cardio' ? 'Km' : undefined} />
        <Row n={1} done={set.completed} last={lastOf(0)} tick={<SetTick done={set.completed} label={set.completed ? 'Done, select to untick' : 'Tick as done'} onClick={() => onTickSet(0)} />}>
          <TimeCell seconds={set.durationSeconds ?? 0} label={`Time, ${name}`} done={set.completed} onCommit={(n) => onValues(0, { durationSeconds: n })} />
          {block.type === 'cardio' ? (
            <NumberCell value={set.distanceKm ?? 0} label={`Kilometres, ${name}`} decimals done={set.completed} onCommit={(n) => onValues(0, { distanceKm: n })} />
          ) : null}
        </Row>
      </div>
    );
  }

  if (isCountdownBlock(block)) {
    const loaded = usesWeight(block.type);
    return (
      <div className="flex flex-col gap-1">
        <Headings first={block.isPerSide ? 'Seconds, each side' : 'Seconds'} second={loaded ? `${unit} · timer` : 'Timer'} />
        {block.sets.map((set, si) => {
          const running = timerSet === si;
          return (
            <Row key={si} n={si + 1} done={set.completed} last={lastOf(si)} tick={<SetTick done={set.completed} label={`Set ${si + 1}${set.completed ? ' done, select to untick' : ', mark as done'}`} onClick={() => onTickSet(si)} />}>
              <div className="min-w-0 flex-1">
                <NumberCell value={set.durationSeconds ?? block.durationSeconds ?? 0} label={`Seconds, set ${si + 1}, ${name}`} decimals={false} done={set.completed} onCommit={(n) => onValues(si, { durationSeconds: n })} />
              </div>
              <div className="flex min-w-0 flex-1 gap-1.5">
                {loaded ? (
                  <div className="min-w-0 flex-1">
                    <NumberCell value={set.weight} label={`${unit}, set ${si + 1}, ${name}`} decimals done={set.completed} onCommit={(n) => onWeight(si, n)} />
                  </div>
                ) : null}
                {set.completed || !onStartTimer ? null : (
                  <button
                    aria-label={running ? `Open the timer, ${timerRemaining} seconds left` : `Start the timer for set ${si + 1}`}
                    onClick={running ? onOpenTimer : () => onStartTimer(si)}
                    className={`flex h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[13.5px] font-bold ${loaded ? 'min-w-[44px]' : 'min-w-[64px] flex-1'}`}
                    style={{ background: running ? 'var(--ink)' : 'var(--sunken)', color: running ? 'var(--ground)' : 'var(--ink)' }}
                  >
                    {running ? (
                      <>
                        {timerPaused ? <Pause size={13} fill="currentColor" /> : <Maximize2 size={14} />}
                        <span className="font-number tabular text-[20px]">{formatClock(timerRemaining)}</span>
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="currentColor" />
                        {/* With a weight in the row too, a phone only has room for the icon. */}
                        <span className={loaded ? 'hidden lg:inline' : ''}>Start</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Headings first={block.isPerSide ? 'Reps, each side' : 'Reps'} second={unit} />
      {block.sets.map((set, si) => (
        <Row key={si} n={si + 1} done={set.completed} last={lastOf(si)} tick={<SetTick done={set.completed} label={`Set ${si + 1}${set.completed ? ' done, select to untick' : ', mark as done'}`} onClick={() => onTickSet(si)} />}>
          <NumberCell value={set.reps} label={`Reps, set ${si + 1}, ${name}`} decimals={false} done={set.completed} onCommit={(n) => onValues(si, { reps: n })} />
          <NumberCell value={set.weight} label={`${unit}, set ${si + 1}, ${name}`} decimals done={set.completed} onCommit={(n) => onWeight(si, n)} />
        </Row>
      ))}
    </div>
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

function InfoSheet({
  block,
  detail,
  alternativeCount,
  accessToken,
  onAlternatives,
  onClose,
}: {
  block: Block;
  detail: ExerciseDetail | null;
  alternativeCount: number;
  accessToken?: string;
  onAlternatives: () => void;
  onClose: () => void;
}) {
  const target = detail?.target ?? block.targetMuscle;
  const also = detail?.secondary_muscles ?? [];
  const facts = [
    target ? ['Works', formatMuscle(target)] : null,
    also.length > 0 ? ['Also', also.map(formatMuscle).join(', ')] : null,
    detail?.equipment ? ['Equipment', formatMuscle(detail.equipment)] : null,
  ].filter((fact): fact is string[] => fact != null);
  const note = block.swappedFrom ? undefined : block.notes;
  return (
    <Sheet open title={formatExerciseName(block.name)} onClose={onClose}>
      <div className="flex flex-col gap-[18px]">
        <ExerciseDemo exerciseId={block.exercise_id} name={block.name} accessToken={accessToken} onCues={() => undefined} showName={false} heightClass="h-[220px]" />
        {facts.length > 0 ? (
          <dl className="flex flex-col gap-1.5 text-[14px]">
            {facts.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-[76px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{k}</dt>
                <dd className="font-semibold" style={{ color: 'var(--ink)' }}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {note ? (
          <p className="flex gap-2 rounded-[14px] px-3.5 py-3 text-[14px] leading-5" style={{ background: 'var(--ground)', color: 'var(--ink)' }}>
            <Sparkles size={16} color="var(--teal)" className="mt-0.5 flex-shrink-0" />
            <span>{note}</span>
          </p>
        ) : null}
        <InfoList title="Your coach's cues" items={block.cues ?? []} />
        <InfoList title="How to do it" items={detail?.instructions ?? []} ordered />
        <InfoList title="Tips" items={detail?.tips ?? []} />
        {detail?.overview ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>About this exercise</h3>
            <p className="text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>{detail.overview}</p>
          </section>
        ) : null}
        <InfoList title="Variations" items={detail?.variations ?? []} />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <a href={youtubeSearchUrl(block.name)} target="_blank" rel="noreferrer" className="flex h-12 flex-1 items-center justify-center rounded-[14px] text-[14px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>Watch on YouTube</a>
            <a href={googleSearchUrl(block.name)} target="_blank" rel="noreferrer" className="flex h-12 flex-1 items-center justify-center rounded-[14px] text-[14px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>Search Google</a>
          </div>
          <Button variant="strong" fullWidth onClick={onAlternatives}>
            {alternativeCount > 0 ? `See ${alternativeCount} alternative${alternativeCount === 1 ? '' : 's'} from your coach` : 'Find an alternative'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function InfoList({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? 'ol' : 'ul';
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
      <List className={`flex flex-col gap-1.5 pl-5 text-[14.5px] leading-[21px] ${ordered ? 'list-decimal' : 'list-disc'}`} style={{ color: 'var(--ink)' }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </section>
  );
}

function FinishSheet({
  done,
  total,
  left,
  started,
  end,
  onChangeTimes,
  onTickAll,
  onFinish,
  onKeepGoing,
}: {
  done: number;
  total: number;
  left: { name: string; left: number }[];
  started: Date;
  end: Date | null;
  onChangeTimes: () => void;
  onTickAll: () => void;
  onFinish: () => void;
  onKeepGoing: () => void;
}) {
  const open = total - done;
  const someDone = done > 0;
  const allDone = open === 0 && total > 0;
  return (
    <Sheet open title={!someDone ? 'Nothing ticked yet' : allDone ? 'Nice work. Finish up?' : `${open} ${open === 1 ? 'set isn’t' : 'sets aren’t'} ticked`} onClose={onKeepGoing}>
      <div className="flex flex-col gap-3.5">
        <p className="text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
          {!someDone ? 'Did you do the workout and just not tick it off?' : allDone ? 'Everything is ticked.' : 'If you did them, tick them all now. They use the numbers shown.'}
        </p>
        {left.length > 0 ? (
          <ul className="rounded-2xl px-4" style={{ background: 'var(--ground)' }}>
            {left.slice(0, 4).map((item, i) => (
              <li key={item.name} className="flex justify-between gap-3 py-2.5 text-[14px]" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{formatExerciseName(item.name)}</span>
                <span className="font-number tabular flex-shrink-0 text-[17px] font-bold" style={{ color: 'var(--ink-2)' }}>{item.left} left</span>
              </li>
            ))}
          </ul>
        ) : null}
        <button onClick={onChangeTimes} className="flex min-h-[44px] items-center justify-between gap-3 text-left text-[14.5px] font-semibold" style={{ color: 'var(--ink)' }}>
          <span>Started {clockText(started)}, finishing {clockText(end ?? new Date())}</span>
          <span className="font-bold" style={{ color: 'var(--teal)' }}>Change</span>
        </button>
        <div className="flex flex-col gap-2">
          {left.length > 0 ? <Button fullWidth size="lg" onClick={onTickAll}>{someDone ? 'I did them, tick them all' : 'Tick everything as planned'}</Button> : null}
          {someDone ? <Button fullWidth size={allDone ? 'lg' : undefined} variant={allDone ? 'primary' : 'quiet'} onClick={onFinish}>{allDone ? 'Finish workout' : 'Finish, I skipped those'}</Button> : null}
          <Button fullWidth variant="link" onClick={onKeepGoing}>Keep going</Button>
        </div>
      </div>
    </Sheet>
  );
}

function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function withTime(date: Date, value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return next;
}

/** Start and end. Phase 6 adds the date to this for past workouts. */
function TimesSheet({ start, end, onDone, onClose }: { start: Date; end: Date; onDone: (start: Date, end: Date) => void; onClose: () => void }) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  const inFuture = to.getTime() > Date.now() + 60_000;
  // By the clock, not the rounded minutes: a workout under a minute old is still valid.
  const ordered = to.getTime() > from.getTime();
  const valid = ordered && !inFuture;
  const length = minutes < 1 ? 'Under a minute' : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const message = !ordered ? 'End time must be after the start' : inFuture ? 'End time can\u2019t be in the future' : length;
  const inputStyle = { background: 'var(--ground)', color: 'var(--ink)', border: '1px solid var(--line)' };
  return (
    <Sheet open title="When was it?" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <label className="flex items-center justify-between gap-3 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
          Start
          <input type="time" value={toTimeInput(from)} onChange={(e) => e.target.value && setFrom(withTime(from, e.target.value))} className="h-12 rounded-xl px-3 text-[16px]" style={inputStyle} />
        </label>
        <label className="flex items-center justify-between gap-3 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
          End
          <input type="time" value={toTimeInput(to)} onChange={(e) => e.target.value && setTo(withTime(to, e.target.value))} className="h-12 rounded-xl px-3 text-[16px]" style={inputStyle} />
        </label>
        <p role="status" className="text-[14px] font-semibold" style={{ color: valid ? 'var(--ink-2)' : 'var(--danger)' }}>{message}</p>
        <Button variant="strong" fullWidth disabled={!valid} onClick={() => onDone(from, to)}>Done</Button>
      </div>
    </Sheet>
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function LogbookSummary({
  blocks,
  title,
  dayKey,
  planId,
  accessToken,
  durationSeconds,
  xpEarned,
  improvedNames,
  watchLinked,
  sessionId,
  saveState,
  saveError,
  onRetrySave,
  onDone,
  logged,
}: {
  blocks: Block[];
  title?: string;
  dayKey: string;
  planId?: string;
  accessToken?: string;
  durationSeconds: number;
  xpEarned: number | null;
  improvedNames: string[];
  watchLinked: boolean;
  sessionId: string | null;
  saveState: 'saving' | 'saved' | 'waiting' | 'refused';
  saveError?: string | null;
  onRetrySave?: () => void;
  onDone: () => void;
  /** Logged afterwards: the times it was saved to. */
  logged?: { start: Date; end: Date } | null;
}) {
  const [kept, setKept] = useState<string[]>([]);
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const changes = planId ? planChanges(blocks) : [];
  const recap = blocks.filter((b) => b.sets.some((s) => s.completed));
  const setCount = blocks.reduce((n, b) => n + b.sets.filter((s) => s.completed).length, 0);
  const improved = new Set(improvedNames);

  const finish = async () => {
    if (kept.length === 0 || !planId || !accessToken) {
      onDone();
      return;
    }
    setKeeping(true);
    setKeepError(null);
    try {
      // Built from the plan as it is now, not as it was when this workout started.
      const { plan } = await getWorkoutPlan(accessToken, planId);
      const day = plan?.plan?.[dayKey];
      if (!day) throw new Error('That day is no longer on your plan.');
      await updatePlanDay(accessToken, planId, dayKey, applyPlanChanges(day, blocks, kept));
      onDone();
    } catch (err) {
      setKeeping(false);
      setKeepError(`Your plan didn’t change. ${userSafeError(err, 'There’s no connection right now.')} Today’s workout is safe either way.`);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-[22px] px-5 pb-6 pt-10">
      <Confetti />
      <header className="flex flex-col gap-2.5">
        {title ? (
          <span className="text-[14px] font-semibold" style={{ color: 'var(--teal)' }}>
            {title}
            {logged ? ` · ${shortDate(logged.end)}` : ''}
          </span>
        ) : null}
        <h1 className="font-number text-[52px] font-extrabold leading-none" style={{ color: 'var(--ink)' }}>{logged ? 'Logged.' : 'Workout complete.'}</h1>
        <p className="text-[16px] leading-[23px]" style={{ color: 'var(--ink-2)' }}>
          {logged
            ? `Saved to ${logged.end.toLocaleDateString(undefined, { weekday: 'long' })}, ${clockText(logged.start)} to ${clockText(logged.end)}. It counts toward that week and your streak.`
            : improved.size > 0
            ? `Up on ${improved.size === 1 ? 'one lift' : `${improved.size} lifts`} from last time. That’s progress you can measure.`
            : 'That’s consistency over intensity.'}
        </p>
      </header>

      {saveState === 'waiting' ? (
        <p role="alert" className="rounded-[14px] p-3.5 text-[14px] leading-5" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
          Saved on this device, will sync. Your XP and this day&rsquo;s tick follow once it does.
        </p>
      ) : null}
      {saveState === 'refused' ? (
        <div role="alert" className="flex flex-col gap-1.5 rounded-[14px] p-3.5" style={{ background: 'var(--sunken)' }}>
          <p className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>We couldn&rsquo;t save this workout, but it&rsquo;s still on this device.</p>
          {saveError ? <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{saveError}</p> : null}
          {onRetrySave ? <Button variant="link" onClick={onRetrySave}>Try again</Button> : null}
        </div>
      ) : null}

      <dl className="grid grid-cols-3 gap-3">
        {[
          ['Time', logged ? `${Math.round(durationSeconds / 60)} min` : formatClock(durationSeconds), 'var(--ink)'],
          ['Sets', String(setCount), 'var(--ink)'],
          ['XP earned', xpEarned == null ? '…' : `+${xpEarned}`, 'var(--gold)'],
        ].map(([label, value, color]) => (
          <div key={label} className="flex flex-col-reverse gap-1">
            <dt className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{label}</dt>
            <dd className="font-number tabular text-[40px] font-extrabold leading-none" style={{ color }}>{value}</dd>
          </div>
        ))}
      </dl>

      {changes.length > 0 ? (
        <section aria-label="Changes you made today" className="flex flex-col gap-3 rounded-[20px] p-4" style={{ background: 'var(--surface)' }}>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[16px] font-bold" style={{ color: 'var(--ink)' }}>Keep these for next {capitalize(dayKey)}?</h2>
            <p className="text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>Today&rsquo;s log is saved either way. This only changes your plan.</p>
          </div>
          {changes.map((change) => {
            const on = kept.includes(change.key);
            return (
              <div key={change.key} className="flex min-h-[52px] items-center gap-3 pt-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14.5px] font-semibold" style={{ color: 'var(--ink)' }}>{formatExerciseName(change.name)}</span>
                  <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{change.replaced ? `Replaced ${formatExerciseName(change.replaced)}` : 'You added this today'}</span>
                </span>
                <button
                  aria-pressed={on}
                  onClick={() => setKept((prev) => (on ? prev.filter((k) => k !== change.key) : [...prev, change.key]))}
                  className="h-11 flex-shrink-0 rounded-xl px-3.5 text-[14px] font-bold"
                  style={{ background: on ? 'var(--ink)' : 'var(--sunken)', color: on ? 'var(--ground)' : 'var(--ink)' }}
                >
                  {on ? 'Keep' : 'Just today'}
                </button>
              </div>
            );
          })}
          {keepError ? <p role="alert" className="text-[13.5px]" style={{ color: 'var(--danger)' }}>{keepError}</p> : null}
        </section>
      ) : null}

      <section aria-label="Session recap" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold" style={{ color: 'var(--ink)' }}>Recap</h2>
          {sessionId ? (
            <Link to={`/workout/edit/${sessionId}`} replace state={{ fromSummary: true }} className="text-[14px] font-bold" style={{ color: 'var(--teal)' }}>Fix something</Link>
          ) : null}
        </div>
        <div className="rounded-[20px]" style={{ background: 'var(--surface)' }}>
          {recap.map((block, i) => (
            <div key={block.key} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold" style={{ color: 'var(--ink)' }}>{formatExerciseName(block.name)}</span>
                {improved.has(block.name.toLowerCase()) ? <span className="text-[12.5px] font-bold" style={{ color: 'var(--gold)' }}>Up from last time</span> : null}
              </span>
              <span className="text-right text-[13px]" style={{ color: 'var(--ink-2)' }}>{exerciseSummary(block)}</span>
            </div>
          ))}
        </div>
      </section>

      {watchLinked ? (
        <p className="text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
          {logged ? 'A watch recording from that time was added to this workout.' : 'Your watch recording was added to this workout.'} Its heart rate is on the workout&rsquo;s page in Activities.
        </p>
      ) : null}

      <Button size="lg" fullWidth disabled={keeping} onClick={() => void finish()}>{keeping ? 'Saving your plan…' : logged ? 'Done' : 'Back to home'}</Button>
    </div>
  );
}

/** The `Prefs` board, on the Profile page. Each one saves as soon as it's changed. */
export function WorkoutPrefsCard({ accessToken }: { accessToken?: string }) {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [error, setError] = useState<string | null>(null);
  const [soundsOn, setSoundsOn] = useState(readTimerSounds);
  const restOn = resolveRestTimer(profile.rest_timer_enabled);
  const step = profile.weight_step != null && profile.weight_step > 0 ? profile.weight_step : 1;
  const unit = profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg';

  const save = (patch: { rest_timer_enabled?: boolean; weight_step?: number; preferred_unit_system?: 'metric' | 'imperial' }) => {
    const before = {
      rest_timer_enabled: profile.rest_timer_enabled,
      weight_step: profile.weight_step,
      preferred_unit_system: profile.preferred_unit_system,
    };
    setProfile(patch);
    setError(null);
    if (!accessToken) return;
    void patchProfile(accessToken, patch as Partial<ProfilePayload>).catch((err: unknown) => {
      setProfile(before);
      setError(userSafeError(err, 'That didn’t save. Check your connection and try again.'));
    });
  };

  const group = (title: string, body: string, control: ReactNode) => (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15.5px] font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
        <p className="text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>{body}</p>
      </div>
      {control}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {group(
        'Rest timer',
        'Counts down after each set you tick. Off suits you if you only log at the end of an exercise.',
        <Segmented value={restOn ? 'on' : 'off'} onChange={(v) => save({ rest_timer_enabled: v === 'on' })} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />,
      )}
      {group(
        'Weight steps',
        'How far one press of the plus and minus keys moves. Hold a key to go faster, or type the number.',
        <Segmented value={String(step)} onChange={(v) => save({ weight_step: Number(v) })} options={[1, 2.5, 5].map((v) => ({ value: String(v), label: `${v} ${unit}` }))} />,
      )}
      {group(
        'Units',
        'Used for new workouts and your body measurements. Past workouts keep what you logged.',
        <Segmented value={profile.preferred_unit_system} onChange={(v) => save({ preferred_unit_system: v as 'metric' | 'imperial' })} options={[{ value: 'metric', label: 'kg' }, { value: 'imperial', label: 'lb' }]} />,
      )}
      {error ? <p role="alert" className="text-[13.5px]" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <p className="text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
        Saved to your account, so the phone and web match. You can still switch the rest timer during any workout.
      </p>
      {group(
        'Timer sounds',
        'Beeps for the last 3 seconds of a timed hold or a rest, when it’s time to switch sides, and at the end. Saved in this browser only.',
        <Segmented
          value={soundsOn ? 'on' : 'off'}
          onChange={(v) => {
            setSoundsOn(v === 'on');
            saveTimerSounds(v === 'on');
          }}
          options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
        />,
      )}
    </div>
  );
}
