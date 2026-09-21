import { ArrowLeftRight, Check, ChevronDown, ChevronRight, ChevronUp, Dumbbell, Minus, Play, Plus, Shuffle, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ExerciseLookup } from '@/components/ExerciseLookup';
import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { NumberEntry } from '@/components/NumberEntry';
import { CardioCaptureCard, ClassCaptureCard, IntervalPlayer } from '@/components/WorkoutCapture';
import { Button, Card, Eyebrow } from '@/components/ui';
import { getExerciseDetail, type ExerciseDetail, type WeightUnit } from '@/lib/api';
import { cardioKindVerb, isCatalogExercise, usesWeight, type ExercisePick } from '@/lib/exercise';
import { stepValue, useHoldRepeat } from '@/lib/useHoldRepeat';
import { useWakeLock } from '@/lib/wakeLock';
import {
  blockTargetText,
  formatClock,
  intervalTotalSeconds,
  isCountdownBlock,
  isIntervalBlock,
  isSingleCaptureBlock,
  sectionLabel,
  type Block,
} from '@/lib/workoutSession';

interface GuidedWorkoutProps {
  blocks: Block[];
  accessToken?: string;
  onSetReps: (blockIndex: number, setIndex: number, reps: number) => void;
  /** Also carries the weight forward to later sets still on the old weight (parent-owned rule). */
  onSetWeight: (blockIndex: number, setIndex: number, weight: number) => void;
  /** Replaces the block's exercise for this session ("Find an alternative"). */
  onSwapExercise: (blockIndex: number, pick: ExercisePick) => void;
  onSetCapture: (
    blockIndex: number,
    setIndex: number,
    patch: { durationSeconds?: number; distanceKm?: number },
  ) => void;
  onCompleteSet: (blockIndex: number, setIndex: number) => void;
  /**
   * `finalCompletion` is the set the user just finished. It is handed over rather than
   * written through `onCompleteSet` because the parent serializes the session in the
   * same tick — a `setState` here would not have flushed, and the last set of the
   * workout would log as skipped.
   */
  onFinish: (finalCompletion?: FinalCompletion) => void;
}

interface Position {
  blockIndex: number;
  setIndex: number;
}

/** A `Position` plus anything captured on it that has not been flushed to the parent. */
interface FinalCompletion extends Position {
  /** Timed holds only: the (possibly user-adjusted) seconds actually worked. */
  durationSeconds?: number;
}

/**
 * Guided, one-exercise-at-a-time workout player (port of the Expo detailed flow):
 * ExerciseDB form demo/video, form cues, a big countdown ring for timed holds or
 * rep/weight dials for lifts, an "up next" preview, a rest overlay between sets, and
 * a jump-anywhere program sheet. Set captures are owned by the parent page (shared
 * with the list view and the persistence/finish logic); this component only drives
 * navigation (current block/set, rest phase).
 */
export default function WorkoutGuided({
  blocks,
  accessToken,
  onSetReps,
  onSetWeight,
  onSwapExercise,
  onSetCapture,
  onCompleteSet,
  onFinish,
}: GuidedWorkoutProps) {
  // Resume at the first incomplete set — matters when the user toggles into the
  // guided view partway through a workout logged from the list view.
  const [blockIndex, setBlockIndex] = useState(() => {
    const bi = blocks.findIndex((b) => b.sets.some((s) => !s.completed));
    return bi === -1 ? 0 : bi;
  });
  const [setIndex, setSetIndex] = useState(() => {
    const bi = blocks.findIndex((b) => b.sets.some((s) => !s.completed));
    if (bi === -1) return 0;
    const si = blocks[bi].sets.findIndex((s) => !s.completed);
    return si === -1 ? 0 : si;
  });
  const [phase, setPhase] = useState<'exercise' | 'rest'>('exercise');
  const [pendingNext, setPendingNext] = useState<Position | null>(null);
  const [programOpen, setProgramOpen] = useState(false);
  // Interval blocks the user opted out of coaching live (outdoor run, phone pocketed) —
  // they collapse to the plain capture card for the rest of the session.
  const [loggedInstead, setLoggedInstead] = useState<string[]>([]);
  const [detailCues, setDetailCues] = useState<string[]>([]);
  // Form-tip text is long — collapsed by default so the demo media keeps the screen.
  // Deliberately not reset per exercise: opting in means "show tips for this session".
  const [showCues, setShowCues] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const totalSets = useMemo(() => blocks.reduce((n, b) => n + b.sets.length, 0), [blocks]);
  const completedSets = useMemo(
    () => blocks.reduce((n, b) => n + b.sets.filter((s) => s.completed).length, 0),
    [blocks],
  );
  const progressPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const block = blocks[blockIndex];
  const set = block?.sets[setIndex];
  const completedFlags = block?.sets.map((s) => s.completed) ?? [];

  const isLastPosition =
    !!block && setIndex + 1 >= block.sets.length && blockIndex + 1 >= blocks.length;

  // Reset catalog-provided cues when the exercise changes — moving on, or swapping it.
  const currentExerciseId = blocks[blockIndex]?.exercise_id;
  useEffect(() => {
    setDetailCues([]);
  }, [blockIndex, currentExerciseId]);

  /**
   * Planned seconds for the current timed exercise. Owned here rather than inside the
   * ring so an adjustment carries across the block's remaining sets and is what gets
   * logged — whether the countdown ran out or the set was completed by hand.
   */
  const blockKey = blocks[blockIndex]?.key;
  const plannedSeconds = blocks[blockIndex]?.durationSeconds;
  const [timedDuration, setTimedDuration] = useState(plannedSeconds ?? DEFAULT_HOLD_SECONDS);
  useEffect(() => {
    setTimedDuration(plannedSeconds ?? DEFAULT_HOLD_SECONDS);
    // `blockKey` is the reset trigger: a new exercise starts from its own planned time.
  }, [blockKey, plannedSeconds]);

  const computeNext = useCallback(
    (bi: number, si: number): Position | null => {
      if (si + 1 < blocks[bi].sets.length) return { blockIndex: bi, setIndex: si + 1 };
      if (bi + 1 < blocks.length) return { blockIndex: bi + 1, setIndex: 0 };
      return null;
    },
    [blocks],
  );

  const advance = useCallback(() => {
    if (!block) return;
    // A per-side hold is worked twice, so the logged time is both sides together.
    const worked = isCountdownBlock(block)
      ? timedDuration * (block.isPerSide ? 2 : 1)
      : undefined;
    const next = computeNext(blockIndex, setIndex);
    if (!next) {
      onFinish({ blockIndex, setIndex, durationSeconds: worked });
      return;
    }
    if (worked != null) onSetCapture(blockIndex, setIndex, { durationSeconds: worked });
    onCompleteSet(blockIndex, setIndex);
    if (block.restSeconds > 0) {
      setPendingNext(next);
      setPhase('rest');
      return;
    }
    setBlockIndex(next.blockIndex);
    setSetIndex(next.setIndex);
  }, [block, blockIndex, setIndex, timedDuration, computeNext, onCompleteSet, onSetCapture, onFinish]);

  /**
   * Leaves the current block entirely, without the between-sets rest. Used by the single
   * "did it" capture blocks (cardio, class) and when bailing out of an interval block.
   */
  const goToNextBlock = useCallback(
    (finalCompletion?: Position) => {
      setPhase('exercise');
      setPendingNext(null);
      if (blockIndex + 1 >= blocks.length) {
        onFinish(finalCompletion);
        return;
      }
      setBlockIndex(blockIndex + 1);
      setSetIndex(0);
    },
    [blockIndex, blocks.length, onFinish],
  );

  /** Completes a single-capture block (one set) and moves straight on. */
  const completeCapture = useCallback(() => {
    if (blockIndex + 1 >= blocks.length) {
      onFinish({ blockIndex, setIndex: 0 });
      return;
    }
    onCompleteSet(blockIndex, 0);
    goToNextBlock();
  }, [blockIndex, blocks.length, onCompleteSet, onFinish, goToNextBlock]);

  const endRest = useCallback(() => {
    setPhase('exercise');
    if (pendingNext) {
      setBlockIndex(pendingNext.blockIndex);
      setSetIndex(pendingNext.setIndex);
      setPendingNext(null);
    }
  }, [pendingNext]);

  const jumpTo = useCallback(
    (index: number) => {
      setProgramOpen(false);
      setPhase('exercise');
      setPendingNext(null);
      setBlockIndex(index);
      const firstIncomplete = blocks[index].sets.findIndex((s) => !s.completed);
      setSetIndex(firstIncomplete === -1 ? 0 : firstIncomplete);
    },
    [blocks],
  );

  if (!block || !set) return null;

  const cues = (block.cues && block.cues.length > 0 ? block.cues : detailCues).slice(0, 4);
  const setLabel = isCountdownBlock(block)
    ? block.type === 'mobility'
      ? block.sets.length > 1
        ? `Hold ${setIndex + 1} of ${block.sets.length}`
        : 'Hold and breathe'
      : block.sets.length > 1
        ? `Round ${setIndex + 1} of ${block.sets.length}`
        : 'Hold'
    : `Set ${setIndex + 1} of ${block.sets.length}`;
  const upNext = blocks.slice(blockIndex + 1, blockIndex + 3);
  const restNextLabel = pendingNext ? blocks[pendingNext.blockIndex].name : undefined;

  // Cardio and class are never catalog-matched, so there is no demo media to show —
  // rendering the placeholder hero for them would just be a dead grey box.
  const showDemo = isCatalogExercise(block.type);
  const collapsedInterval = loggedInstead.includes(block.key);
  const intervalLive = isIntervalBlock(block) && !collapsedInterval;
  const singleCapture = isSingleCaptureBlock(block) || collapsedInterval;
  const isLastBlock = blockIndex + 1 >= blocks.length;

  const primaryLabel = singleCapture
    ? block.type === 'class'
      ? 'Mark class complete'
      : `Log this ${cardioKindVerb(block.activityKind)}`
    : intervalLive
      ? isLastBlock
        ? 'Finish workout'
        : 'Next exercise'
      : isLastPosition
        ? 'Finish workout'
        : 'Complete set';

  const onPrimary = singleCapture
    ? completeCapture
    : intervalLive
      ? () => goToNextBlock()
      : advance;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Section eyebrow + progress, and the way out of an exercise the user can't do —
            up top, where it is found before the set rather than after. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <Eyebrow>{sectionLabel(block.section)}</Eyebrow>
            <span className="tabular text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {Math.min(completedSets + 1, totalSets)} / {totalSets}
            </span>
          </div>
          {showDemo ? (
            <button
              onClick={() => setSwapOpen(true)}
              className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition-transform active:scale-95"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', color: 'var(--accent-text)' }}
            >
              <Shuffle size={14} /> Find alternative
            </button>
          ) : null}
        </div>

        {showDemo ? (
          <div className="flex flex-col gap-2.5">
            {block.swappedFrom ? (
              <p className="-mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Swapped from {block.swappedFrom} for today
              </p>
            ) : null}
            <ExerciseDemo
              key={`${block.key}-${block.exercise_id ?? 'unlinked'}`}
              exerciseId={block.exercise_id}
              name={block.name}
              accessToken={accessToken}
              onCues={setDetailCues}
            />
            {/* Escape hatch to the wider web: catalog coverage is never complete,
                and "how do I do this?" is most urgent mid-set. Opens in a new tab
                so the session in progress is never navigated away from. */}
            <ExerciseLookup name={block.name} prominent={!block.exercise_id} />
          </div>
        ) : null}

        {/* "Each side" is not a row of its own — it rides on the rep dial / timer,
            where the number it qualifies actually lives. */}
        {block.notes ? <CoachNote text={block.notes} /> : null}

        {cues.length > 0 ? (
          <div className="flex flex-col gap-2">
            <button onClick={() => setShowCues((v) => !v)} className="flex items-center justify-between">
              <Eyebrow>Form tips</Eyebrow>
              <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--accent-text)' }}>
                {showCues ? 'HIDE' : 'SHOW'} {showCues ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
            {showCues ? <FormCues cues={cues} /> : null}
          </div>
        ) : null}

        {intervalLive ? (
          <IntervalPlayer
            key={block.key}
            block={block}
            completed={completedFlags}
            onCompleteRound={(round) => onCompleteSet(blockIndex, round)}
            onEndEarly={() => goToNextBlock()}
            onLogInstead={() => {
              setLoggedInstead((prev) => [...prev, block.key]);
              // Seed the capture with the whole session, not one work interval.
              onSetCapture(blockIndex, 0, { durationSeconds: intervalTotalSeconds(block) });
            }}
          />
        ) : block.type === 'class' ? (
          <ClassCaptureCard
            block={block}
            onCapture={(patch) => onSetCapture(blockIndex, 0, patch)}
          />
        ) : singleCapture ? (
          <CardioCaptureCard
            block={block}
            onCapture={(patch) => onSetCapture(blockIndex, 0, patch)}
          />
        ) : isCountdownBlock(block) ? (
          <TimedRing
            key={`${block.key}-${setIndex}`}
            durationSeconds={timedDuration}
            perSide={block.isPerSide}
            onAdjust={(delta) =>
              setTimedDuration((d) => Math.max(ADJUST_STEP_SECONDS, d + delta))
            }
            setLabel={setLabel}
            completed={completedFlags}
            currentIndex={setIndex}
            onAutoComplete={advance}
            weight={set.weight}
            weightUnit={block.weightUnit}
            onSetWeight={
              usesWeight(block.type) ? (w) => onSetWeight(blockIndex, setIndex, w) : undefined
            }
          />
        ) : (
          <RepWeightDials
            reps={set.reps}
            weight={set.weight}
            weightUnit={block.weightUnit}
            repTarget={block.repText}
            isPerSide={block.isPerSide}
            setLabel={setLabel}
            completed={completedFlags}
            currentIndex={setIndex}
            onRepStep={(dir) => onSetReps(blockIndex, setIndex, Math.max(0, Math.round(set.reps + dir)))}
            onRepSet={(reps) => onSetReps(blockIndex, setIndex, reps)}
            onWeightStep={(dir, scale) => onSetWeight(blockIndex, setIndex, stepValue(set.weight, dir, scale))}
            onWeightSet={(weight) => onSetWeight(blockIndex, setIndex, weight)}
          />
        )}

        {/* Up next */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setProgramOpen(true)}
            className="flex items-center justify-between"
          >
            <Eyebrow>Up next</Eyebrow>
            <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--accent-text)' }}>
              FULL PROGRAM <ChevronRight size={13} />
            </span>
          </button>
          {upNext.length > 0 ? (
            upNext.map((b, i) => (
              <div
                key={b.key}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
              >
                <span className="tabular text-[11px] font-extrabold" style={{ color: 'var(--text-muted)' }}>
                  {blockIndex + i + 2}
                </span>
                <span className="truncate text-[13.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  {b.name}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Last block — finish strong.
            </p>
          )}
        </div>
      </div>

      {/* Sticky footer — workout mode hides the app nav, so this owns the bottom edge. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-5 pt-4"
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-base)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <div className="tabular flex-1 text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {completedSets}/{totalSets} sets · {progressPct}%
          </div>
          <Button
            size="lg"
            onClick={onPrimary}
            leftIcon={
              primaryLabel === 'Finish workout' ? <Dumbbell size={16} color="#06224D" /> : undefined
            }
          >
            {primaryLabel}
          </Button>
        </div>
      </div>

      {phase === 'rest' ? (
        <RestOverlay
          key={`${blockIndex}-${setIndex}`}
          seconds={block.restSeconds}
          nextLabel={restNextLabel}
          onDone={endRest}
        />
      ) : null}

      {swapOpen ? (
        <FindAlternativeDialog
          accessToken={accessToken}
          name={block.name}
          exerciseId={block.exercise_id}
          onClose={() => setSwapOpen(false)}
          onPick={(pick) => {
            onSwapExercise(blockIndex, pick);
            setSwapOpen(false);
          }}
        />
      ) : null}

      {programOpen ? (
        <ProgramSheet
          blocks={blocks}
          currentIndex={blockIndex}
          onJump={jumpTo}
          onClose={() => setProgramOpen(false)}
        />
      ) : null}
    </>
  );
}

// ─── Exercise demo (ExerciseDB media hero) ────────────────────────────────────

function ExerciseDemo({
  exerciseId,
  name,
  accessToken,
  onCues,
}: {
  exerciseId?: string;
  name: string;
  accessToken?: string;
  onCues: (cues: string[]) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCuesRef = useRef(onCues);
  onCuesRef.current = onCues;

  useEffect(() => {
    let active = true;
    setImageUrl(null);
    setVideoUrl(null);
    setPlaying(false);
    if (!exerciseId || !accessToken) return;

    void (async () => {
      try {
        const result = await getExerciseDetail(accessToken, exerciseId);
        if (!active) return;
        const ex: ExerciseDetail = result.exercise;
        setImageUrl(ex.image_url ?? ex.gif_url ?? null);
        setVideoUrl(ex.video_url);
        // v2 `tips` read as short form cues; fall back to step instructions.
        const source = ex.tips.length > 0 ? ex.tips : ex.instructions;
        onCuesRef.current(source.slice(0, 4));
      } catch {
        // Catalog unavailable — keep the placeholder.
      }
    })();
    return () => {
      active = false;
    };
  }, [exerciseId, accessToken]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!videoUrl || !el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  }, [videoUrl, playing]);

  return (
    <button
      onClick={togglePlay}
      disabled={!videoUrl}
      className="relative flex h-[180px] w-full items-end overflow-hidden rounded-[18px] disabled:cursor-default"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      {/* Poster / placeholder */}
      {imageUrl && !playing ? (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : !videoUrl ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bg-subtle)' }}>
          <Dumbbell size={34} color="var(--accent)" />
        </div>
      ) : null}

      {/* Video (kept mounted so playback controls work; hidden until playing) */}
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
          style={{ opacity: playing ? 1 : 0 }}
        />
      ) : null}

      {/* Play affordance */}
      {videoUrl && !playing ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.92)' }}>
            <Play size={22} color="#06224D" fill="#06224D" />
          </div>
        </div>
      ) : null}

      <span
        className="absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-extrabold tracking-[0.08em] text-white"
        style={{ background: 'rgba(6,34,77,0.5)' }}
      >
        FORM DEMO
      </span>

      {!playing ? (
        // Scrim chip, matching the FORM DEMO badge. A bare text-shadow is not
        // enough here: the poster is `object-contain`, so the bottom-left corner
        // this label sits in is letterboxed card background, not image — and with
        // no catalog match there is no image at all. White-on-light either way.
        <span
          className="relative m-3.5 max-w-[calc(100%-28px)] truncate rounded-lg px-2.5 py-1 text-[18px] font-extrabold text-white"
          style={{ background: 'rgba(6,34,77,0.5)' }}
        >
          {name}
        </span>
      ) : null}
    </button>
  );
}

// ─── Timed hold: big countdown ring ───────────────────────────────────────────

const RING_SIZE = 200;
const RING_THICKNESS = 12;
const RADIUS = (RING_SIZE - RING_THICKNESS) / 2;
const CENTER = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Granularity of the ± control under the ring, and its floor. */
const ADJUST_STEP_SECONDS = 5;
const DEFAULT_HOLD_SECONDS = 30;

/**
 * The countdown for a timed hold, with the planned time and a ± control underneath so
 * it can be re-dialled without leaving the set.
 *
 * A per-side hold runs the clock twice: side one, a "switch side" stop the user has to
 * acknowledge (they need both hands free to reposition, not a clock that has already
 * started), then side two — after which the set completes.
 */
function TimedRing({
  durationSeconds,
  perSide = false,
  onAdjust,
  setLabel,
  completed,
  currentIndex,
  onAutoComplete,
  weight,
  weightUnit,
  onSetWeight,
}: {
  durationSeconds: number;
  perSide?: boolean;
  onAdjust: (delta: number) => void;
  setLabel: string;
  completed: boolean[];
  currentIndex: number;
  onAutoComplete: () => void;
  weight: number;
  weightUnit: WeightUnit;
  /** Omitted for the types that never carry a load (mobility). */
  onSetWeight?: (weight: number) => void;
}) {
  type Status = 'idle' | 'running' | 'paused' | 'switch' | 'done';
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(durationSeconds);
  /** 1 = first side (or the only round for a two-sided-agnostic hold), 2 = second. */
  const [side, setSide] = useState(1);
  const endsAtRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onAutoComplete);
  onCompleteRef.current = onAutoComplete;
  const sideRef = useRef(side);
  sideRef.current = side;

  // Keep the screen alive for the duration of the hold — the browser's stand-in for
  // the mobile app's keep-awake, and the reason a 90s plank doesn't end in a lock screen.
  useWakeLock(status === 'running');

  // Single source of truth: derive remaining from a wall-clock deadline so the
  // countdown stays correct across tab-backgrounding (JS timers throttle there).
  const evaluate = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt == null) return;
    const next = Math.max(0, (endsAt - Date.now()) / 1000);
    setRemaining(next);
    if (next > 0 || firedRef.current) return;
    firedRef.current = true;
    endsAtRef.current = null;
    if (perSide && sideRef.current === 1) {
      // Hold here until the user has actually swapped sides.
      setStatus('switch');
      return;
    }
    setStatus('done');
    onCompleteRef.current();
  }, [perSide]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(evaluate, 150);
    const onVisible = () => {
      if (document.visibilityState === 'visible') evaluate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, evaluate]);

  // An un-started clock always shows the planned time. The prop can move after mount —
  // the ± control below, and the parent settling on the new block's planned seconds
  // the render after a jump — and a stale `remaining` would draw a part-filled ring.
  useEffect(() => {
    if (status === 'idle') setRemaining(durationSeconds);
  }, [status, durationSeconds]);

  const toggle = useCallback(() => {
    if (status === 'running') {
      const endsAt = endsAtRef.current;
      if (endsAt != null) setRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
      endsAtRef.current = null;
      setStatus('paused');
      return;
    }
    if (status === 'switch') {
      // Second side starts from a full clock.
      firedRef.current = false;
      setSide(2);
      setRemaining(durationSeconds);
      endsAtRef.current = Date.now() + durationSeconds * 1000;
      setStatus('running');
      return;
    }
    if (status === 'idle' || status === 'paused') {
      endsAtRef.current = Date.now() + remaining * 1000;
      setStatus('running');
    }
  }, [status, remaining, durationSeconds]);

  /**
   * Re-dial the planned time mid-set. While the clock runs the deadline shifts by the
   * same amount, so "+5s" means five more seconds of work rather than a restart.
   */
  const adjust = useCallback(
    (delta: number) => {
      const applied = Math.max(ADJUST_STEP_SECONDS, durationSeconds + delta) - durationSeconds;
      if (applied === 0) return;
      onAdjust(applied);
      if (status === 'running' && endsAtRef.current != null) {
        endsAtRef.current += applied * 1000;
        evaluate();
      } else if (status === 'paused') {
        setRemaining((r) => Math.max(0, r + applied));
      }
      // Idle is handled by the sync effect above.
    },
    [durationSeconds, status, onAdjust, evaluate],
  );

  const progress = durationSeconds > 0 ? Math.min(1, Math.max(0, (durationSeconds - remaining) / durationSeconds)) : 0;
  const dashoffset = CIRCUMFERENCE * (1 - progress);
  const displaySeconds = Math.ceil(Math.max(0, remaining));
  const isIdle = status === 'idle';
  const isSwitch = status === 'switch';
  const ringLabel = isSwitch
    ? 'Start the second side'
    : isIdle
      ? 'Start timer'
      : status === 'running'
        ? 'Pause timer'
        : 'Resume timer';
  const runningCaption = status === 'paused'
    ? 'Paused · tap to resume'
    : perSide
      ? `${setLabel} · side ${side} of 2`
      : setLabel;

  return (
    <div className="flex flex-col items-center gap-3.5 pt-1">
      <button
        onClick={toggle}
        aria-label={ringLabel}
        className="relative flex items-center justify-center transition-transform active:scale-95"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg width={RING_SIZE} height={RING_SIZE} className="absolute">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="var(--border-base)" strokeWidth={RING_THICKNESS} fill="none" />
          {progress > 0 && !isSwitch ? (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke="var(--accent)"
              strokeWidth={RING_THICKNESS}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          ) : null}
          {isSwitch ? (
            <circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="var(--accent)" strokeWidth={RING_THICKNESS} fill="none" />
          ) : null}
        </svg>

        {isSwitch ? (
          <div className="flex flex-col items-center gap-1.5 px-6">
            <ArrowLeftRight size={34} color="var(--accent-text)" strokeWidth={2.4} />
            <span className="text-[19px] font-extrabold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Switch side
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Tap when you&rsquo;re set
            </span>
          </div>
        ) : isIdle ? (
          <div className="flex flex-col items-center gap-1.5">
            <Play size={42} color="var(--accent)" fill="var(--accent)" />
            <span className="text-[13px] font-extrabold tracking-[0.12em]" style={{ color: 'var(--accent-text)' }}>
              START
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span
              className="tabular text-[46px] font-extrabold leading-none"
              style={{ color: status === 'paused' ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              {formatClock(displaySeconds)}
            </span>
            <span className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {runningCaption}
            </span>
          </div>
        )}
      </button>

      {/* Planned time — dialled here rather than back on the plan screen. */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-3.5">
          <RoundStep kind="dec" onClick={() => adjust(-ADJUST_STEP_SECONDS)} label="Reduce hold time" />
          <span className="tabular min-w-[112px] text-center text-[22px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {formatClock(durationSeconds)}
            {perSide ? (
              <span className="ml-1.5 text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
                per side
              </span>
            ) : null}
          </span>
          <RoundStep kind="inc" onClick={() => adjust(ADJUST_STEP_SECONDS)} label="Increase hold time" />
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Planned time — adjust if you need to
        </span>
      </div>

      {onSetWeight ? (
        <LoadControl weight={weight} weightUnit={weightUnit} perSide={perSide} onSet={onSetWeight} />
      ) : null}

      <SetPips total={completed.length} currentIndex={currentIndex} completed={completed} />
    </div>
  );
}

/**
 * The load on a timed hold, under the ring.
 *
 * Deliberately not a second `Dial`: the countdown is the hero of this screen and a
 * matching pair of dials would read as two equal captures. This is one quiet row —
 * same ± / hold-to-repeat / tap-to-type behaviour as the rep dials, a third of the
 * height. Bodyweight holds show a chip instead, so a plank keeps its clean screen.
 */
function LoadControl({
  weight,
  weightUnit,
  perSide,
  onSet,
}: {
  weight: number;
  weightUnit: WeightUnit;
  perSide: boolean;
  onSet: (weight: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (weight <= 0 && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex h-11 items-center gap-2 rounded-2xl px-5 text-[13px] font-bold transition-transform active:scale-95"
        style={{ border: '1.5px dashed var(--border-strong)', color: 'var(--text-secondary)' }}
      >
        <Plus size={15} /> Add weight
      </button>
    );
  }

  return (
    <div
      className="flex w-full max-w-[380px] flex-col gap-2 rounded-[20px] px-3.5 py-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
          Load
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {perSide ? 'per side · tap to type' : 'tap to type'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <RoundStep
          kind="dec"
          onClick={(scale) => onSet(stepValue(weight, -1, scale))}
          bigStep={5}
          label="Decrease weight"
        />
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
          <NumberEntry
            value={weight}
            decimals={2}
            onCommit={onSet}
            label={`Weight in ${weightUnit}`}
            className="text-[28px] leading-none"
          />
          <span className="text-[13px] font-bold" style={{ color: 'var(--text-secondary)' }}>
            {weightUnit}
          </span>
        </div>
        <RoundStep
          kind="inc"
          onClick={(scale) => onSet(stepValue(weight, 1, scale))}
          bigStep={5}
          label="Increase weight"
        />
      </div>
    </div>
  );
}

// ─── Rep / weight dials ───────────────────────────────────────────────────────

function RepWeightDials({
  reps,
  weight,
  weightUnit,
  repTarget,
  isPerSide,
  setLabel,
  completed,
  currentIndex,
  onRepStep,
  onRepSet,
  onWeightStep,
  onWeightSet,
}: {
  reps: number;
  weight: number;
  weightUnit: string;
  repTarget?: string;
  isPerSide?: boolean;
  setLabel: string;
  completed: boolean[];
  currentIndex: number;
  onRepStep: (direction: 1 | -1) => void;
  onRepSet: (reps: number) => void;
  onWeightStep: (direction: 1 | -1, scale: number) => void;
  onWeightSet: (weight: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {setLabel}
      </span>
      <div className="flex w-full gap-3">
        {/* "per side" qualifies the rep count, so it belongs on the rep dial. */}
        <Dial
          label={isPerSide ? 'Reps per side' : 'Reps'}
          value={reps}
          caption={repTarget ? `target ${repTarget}` : 'reps'}
          onStep={(dir) => onRepStep(dir)}
          onSet={onRepSet}
        />
        {/* Single-unit taps so any load is reachable; hold ± to run (in 5s after a moment),
            or tap the number to type an exact weight like 22.5. */}
        <Dial
          label="Weight"
          value={weight}
          decimals={2}
          bigStep={5}
          caption={weightUnit}
          onStep={onWeightStep}
          onSet={onWeightSet}
        />
      </div>
      <SetPips total={completed.length} currentIndex={currentIndex} completed={completed} />
    </div>
  );
}

function Dial({
  label,
  value,
  decimals = 0,
  bigStep,
  caption,
  onStep,
  onSet,
}: {
  label: string;
  value: number;
  decimals?: number;
  bigStep?: number;
  caption: string;
  onStep: (direction: 1 | -1, scale: number) => void;
  onSet: (value: number) => void;
}) {
  // Two dials share a phone-width row, which leaves each too narrow for "− 107.5 +" on
  // one line. Below `sm` the number and caption take their own rows and the ± pair sits
  // underneath; from `sm` up the buttons flank the number again.
  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center gap-2.5 rounded-[20px] px-2.5 py-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      <span className="text-center text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-x-3">
        <RoundStep kind="dec" onClick={(scale) => onStep(-1, scale)} bigStep={bigStep} label={`Decrease ${label}`} className="order-3 sm:order-1" />
        <div className="order-1 flex basis-full justify-center sm:order-2 sm:min-w-[56px] sm:basis-auto">
          <NumberEntry
            value={value}
            decimals={decimals}
            onCommit={onSet}
            label={`${label}${caption ? ` (${caption})` : ''}`}
            className="py-0.5 text-[34px] leading-none min-[380px]:text-[38px]"
          />
        </div>
        <RoundStep kind="inc" onClick={(scale) => onStep(1, scale)} bigStep={bigStep} label={`Increase ${label}`} className="order-4 sm:order-3" />
        <span className="order-2 basis-full text-center text-[11px] sm:order-4" style={{ color: 'var(--text-muted)' }}>
          {caption}
        </span>
      </div>
    </div>
  );
}

function RoundStep({
  kind,
  onClick,
  bigStep,
  label,
  className = '',
}: {
  kind: 'inc' | 'dec';
  onClick: (scale: number) => void;
  bigStep?: number;
  label: string;
  className?: string;
}) {
  const Icon = kind === 'inc' ? Plus : Minus;
  const hold = useHoldRepeat(onClick, { bigStep });
  return (
    <button
      {...hold}
      aria-label={label}
      className={`flex h-10 w-10 flex-shrink-0 select-none items-center justify-center rounded-full transition-transform active:scale-90 ${className}`}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }}
    >
      <Icon size={17} color="var(--accent-text)" />
    </button>
  );
}

function SetPips({ total, currentIndex, completed }: { total: number; currentIndex: number; completed: boolean[] }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const active = completed[i] || i === currentIndex;
        return (
          <span
            key={i}
            className="h-2 rounded-full transition-all"
            style={{ width: i === currentIndex ? 22 : 8, background: active ? 'var(--accent)' : 'var(--border-base)' }}
          />
        );
      })}
    </div>
  );
}

// ─── Rest overlay ─────────────────────────────────────────────────────────────

function RestOverlay({ seconds, nextLabel, onDone }: { seconds: number; nextLabel?: string; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Rest is exactly when a phone would otherwise lock itself.
  useWakeLock(true);

  useEffect(() => {
    if (remaining <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onDoneRef.current();
      }
      return;
    }
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const skip = useCallback(() => {
    firedRef.current = true;
    onDoneRef.current();
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4"
      style={{ background: 'rgba(6,34,77,0.72)', backdropFilter: 'blur(2px)' }}
    >
      <span className="text-[12px] font-extrabold tracking-[0.12em]" style={{ color: 'var(--accent)' }}>
        REST
      </span>
      <span className="tabular text-[64px] font-extrabold leading-none text-white">{formatClock(remaining)}</span>
      {nextLabel ? <span className="text-[13.5px]" style={{ color: 'var(--forma-mint, #7BE3D3)' }}>Up next · {nextLabel}</span> : null}
      <div className="mt-1.5 flex gap-2.5">
        <button
          onClick={() => setRemaining((r) => r + 15)}
          className="rounded-xl px-[18px] py-2.5 text-[14px] font-bold text-white"
          style={{ border: '1px solid rgba(255,255,255,0.5)' }}
        >
          +15s
        </button>
        <button
          onClick={skip}
          className="rounded-xl px-[22px] py-2.5 text-[14px] font-extrabold"
          style={{ background: 'var(--accent)', color: '#06224D' }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Program sheet (jump anywhere) ────────────────────────────────────────────

function ProgramSheet({
  blocks,
  currentIndex,
  onJump,
  onClose,
}: {
  blocks: Block[];
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
}) {
  const sections: Block['section'][] = ['warmup', 'main', 'cooldown'];
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(6,34,77,0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82%] w-full max-w-[760px] flex-col rounded-t-[26px]"
        style={{ background: 'var(--bg-app)', borderTop: '1px solid var(--border-base)' }}
      >
        <div className="flex items-center justify-between p-4">
          <span className="text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            Full program
          </span>
          <button
            onClick={onClose}
            aria-label="Close program"
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
          >
            <X size={19} color="var(--text-secondary)" />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-4 pt-0">
          {sections.map((section) => {
            const items = blocks
              .map((block, index) => ({ block, index }))
              .filter((b) => b.block.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="flex flex-col gap-2.5">
                <Eyebrow>{sectionLabel(section)}</Eyebrow>
                <div className="flex flex-col gap-2">
                  {items.map(({ block, index }) => {
                    const isDone = block.sets.every((s) => s.completed);
                    const isCurrent = index === currentIndex;
                    return (
                      <button
                        key={block.key}
                        onClick={() => onJump(index)}
                        className="flex items-center gap-3 rounded-[14px] p-3 text-left"
                        style={{
                          background: 'var(--bg-surface)',
                          border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border-base)'}`,
                        }}
                      >
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold"
                          style={
                            isDone
                              ? { background: 'var(--accent)', color: '#06224D' }
                              : {
                                  border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? 'var(--accent)' : 'var(--border-strong)'}`,
                                  color: isCurrent ? 'var(--accent-text)' : 'var(--text-muted)',
                                }
                          }
                        >
                          {isDone ? <Check size={15} color="#06224D" strokeWidth={3} /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                            {block.name}
                          </div>
                          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                            {blockTargetText(block)}
                          </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Coach note + form cues ───────────────────────────────────────────────────

/**
 * The mint fill is the same in light and dark, so everything on it reads from the
 * `on-mint` tokens — the theme-flipping text colours turn white-on-mint in dark.
 */
function CoachNote({ text }: { text: string }) {
  return (
    <Card padding="12px" style={{ background: 'var(--bg-selected)', border: '1px solid var(--accent)' }}>
      <div className="flex items-start gap-2.5">
        <Sparkles size={16} color="var(--text-on-mint)" className="mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-[10.5px] font-extrabold tracking-[0.06em]" style={{ color: 'var(--text-on-mint)' }}>
            COACH NOTE
          </div>
          <p className="mt-0.5 text-[13px] leading-[1.5]" style={{ color: 'var(--text-on-mint-soft)' }}>
            {text}
          </p>
        </div>
      </div>
    </Card>
  );
}

function FormCues({ cues }: { cues: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      {cues.map((cue, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
          <span className="text-[12.5px] leading-[1.45]" style={{ color: 'var(--text-secondary)' }}>
            {cue}
          </span>
        </div>
      ))}
    </div>
  );
}
