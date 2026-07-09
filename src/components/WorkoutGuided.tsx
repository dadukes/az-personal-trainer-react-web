import { Check, ChevronRight, Dumbbell, Minus, Play, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Card, Eyebrow } from '@/components/ui';
import { getExerciseDetail, type ExerciseDetail } from '@/lib/api';
import { formatClock, sectionLabel, type Block } from '@/lib/workoutSession';

interface GuidedWorkoutProps {
  blocks: Block[];
  accessToken?: string;
  dayNotes?: string;
  onSetReps: (blockIndex: number, setIndex: number, reps: number) => void;
  onSetWeight: (blockIndex: number, setIndex: number, weight: number) => void;
  onCompleteSet: (blockIndex: number, setIndex: number) => void;
  onFinish: () => void;
}

interface Position {
  blockIndex: number;
  setIndex: number;
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
  dayNotes,
  onSetReps,
  onSetWeight,
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
  const [detailCues, setDetailCues] = useState<string[]>([]);

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

  // Reset catalog-provided cues when the exercise changes.
  useEffect(() => {
    setDetailCues([]);
  }, [blockIndex]);

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
    onCompleteSet(blockIndex, setIndex);
    const next = computeNext(blockIndex, setIndex);
    if (!next) {
      onFinish();
      return;
    }
    if (block.restSeconds > 0) {
      setPendingNext(next);
      setPhase('rest');
      return;
    }
    setBlockIndex(next.blockIndex);
    setSetIndex(next.setIndex);
  }, [block, blockIndex, setIndex, computeNext, onCompleteSet, onFinish]);

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
  const setLabel = block.timed
    ? block.sets.length > 1
      ? `Round ${setIndex + 1} of ${block.sets.length}`
      : 'Hold'
    : `Set ${setIndex + 1} of ${block.sets.length}`;
  const upNext = blocks.slice(blockIndex + 1, blockIndex + 3);
  const restNextLabel = pendingNext ? blocks[pendingNext.blockIndex].name : undefined;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Section eyebrow + progress */}
        <div className="flex items-center justify-between">
          <Eyebrow>{sectionLabel(block.section)}</Eyebrow>
          <span className="tabular text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            {Math.min(completedSets + 1, totalSets)} / {totalSets}
          </span>
        </div>

        {dayNotes ? <CoachNote text={dayNotes} label="SESSION NOTE" subtle /> : null}

        <ExerciseDemo
          key={block.key}
          exerciseId={block.exercise_id}
          name={block.name}
          accessToken={accessToken}
          onCues={setDetailCues}
        />

        {block.notes ? <CoachNote text={block.notes} /> : null}
        {cues.length > 0 ? <FormCues cues={cues} /> : null}

        {block.timed ? (
          <TimedRing
            key={`${block.key}-${setIndex}`}
            durationSeconds={block.durationSeconds ?? 30}
            setLabel={setLabel}
            completed={completedFlags}
            currentIndex={setIndex}
            onAutoComplete={advance}
          />
        ) : (
          <RepWeightDials
            reps={set.reps}
            weight={set.weight}
            weightUnit={block.weightUnit}
            repTarget={block.repText}
            setLabel={setLabel}
            completed={completedFlags}
            currentIndex={setIndex}
            onRepDelta={(d) => onSetReps(blockIndex, setIndex, Math.max(0, Math.round(set.reps + d)))}
            onWeightDelta={(d) =>
              onSetWeight(blockIndex, setIndex, Math.max(0, Math.round((set.weight + d) * 10) / 10))
            }
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

      {/* Sticky footer — sits above the mobile tab bar (bottom-[74px]) like the list view's finish bar. */}
      <div
        className="fixed inset-x-0 bottom-[74px] z-30 px-5 py-4 md:bottom-0 md:left-[88px] lg:left-[264px]"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-base)' }}
      >
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <div className="tabular flex-1 text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {completedSets}/{totalSets} sets · {progressPct}%
          </div>
          <Button
            size="lg"
            onClick={advance}
            leftIcon={isLastPosition ? <Dumbbell size={16} color="#06224D" /> : undefined}
          >
            {isLastPosition ? 'Finish workout' : 'Complete set'}
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
        <span
          className="relative m-3.5 truncate text-[18px] font-extrabold text-white"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
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

function TimedRing({
  durationSeconds,
  setLabel,
  completed,
  currentIndex,
  onAutoComplete,
}: {
  durationSeconds: number;
  setLabel: string;
  completed: boolean[];
  currentIndex: number;
  onAutoComplete: () => void;
}) {
  type Status = 'idle' | 'running' | 'paused' | 'done';
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(durationSeconds);
  const endsAtRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onAutoComplete);
  onCompleteRef.current = onAutoComplete;

  // Single source of truth: derive remaining from a wall-clock deadline so the
  // countdown stays correct across tab-backgrounding (JS timers throttle there).
  const evaluate = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt == null) return;
    const next = Math.max(0, (endsAt - Date.now()) / 1000);
    setRemaining(next);
    if (next <= 0 && !firedRef.current) {
      firedRef.current = true;
      endsAtRef.current = null;
      setStatus('done');
      onCompleteRef.current();
    }
  }, []);

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

  const toggle = useCallback(() => {
    if (status === 'running') {
      const endsAt = endsAtRef.current;
      if (endsAt != null) setRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
      endsAtRef.current = null;
      setStatus('paused');
    } else if (status === 'idle' || status === 'paused') {
      endsAtRef.current = Date.now() + remaining * 1000;
      setStatus('running');
    }
  }, [status, remaining]);

  const progress = durationSeconds > 0 ? Math.min(1, Math.max(0, (durationSeconds - remaining) / durationSeconds)) : 0;
  const dashoffset = CIRCUMFERENCE * (1 - progress);
  const displaySeconds = Math.ceil(Math.max(0, remaining));
  const isIdle = status === 'idle';

  return (
    <div className="flex flex-col items-center gap-4 pt-1">
      <button
        onClick={toggle}
        aria-label={isIdle ? 'Start timer' : status === 'running' ? 'Pause timer' : 'Resume timer'}
        className="relative flex items-center justify-center transition-transform active:scale-95"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg width={RING_SIZE} height={RING_SIZE} className="absolute">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="var(--border-base)" strokeWidth={RING_THICKNESS} fill="none" />
          {progress > 0 ? (
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
        </svg>

        {isIdle ? (
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
              {status === 'paused' ? 'Paused · tap to resume' : setLabel}
            </span>
          </div>
        )}
      </button>

      <SetPips total={completed.length} currentIndex={currentIndex} completed={completed} />
    </div>
  );
}

// ─── Rep / weight dials ───────────────────────────────────────────────────────

function RepWeightDials({
  reps,
  weight,
  weightUnit,
  repTarget,
  setLabel,
  completed,
  currentIndex,
  onRepDelta,
  onWeightDelta,
}: {
  reps: number;
  weight: number;
  weightUnit: string;
  repTarget?: string;
  setLabel: string;
  completed: boolean[];
  currentIndex: number;
  onRepDelta: (delta: number) => void;
  onWeightDelta: (delta: number) => void;
}) {
  const weightStep = weightUnit === 'kg' ? 2.5 : 5;
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {setLabel}
      </span>
      <div className="flex w-full gap-3">
        <Dial label="Reps" value={String(reps)} caption={repTarget ? `target ${repTarget}` : 'reps'} onDec={() => onRepDelta(-1)} onInc={() => onRepDelta(1)} />
        <Dial label="Weight" value={String(weight)} caption={weightUnit} onDec={() => onWeightDelta(-weightStep)} onInc={() => onWeightDelta(weightStep)} />
      </div>
      <SetPips total={completed.length} currentIndex={currentIndex} completed={completed} />
    </div>
  );
}

function Dial({
  label,
  value,
  caption,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  caption: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center gap-2.5 rounded-[20px] px-2.5 py-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <RoundStep kind="dec" onClick={onDec} label={`Decrease ${label}`} />
        <span className="tabular min-w-[56px] text-center text-[38px] font-extrabold leading-none" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        <RoundStep kind="inc" onClick={onInc} label={`Increase ${label}`} />
      </div>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {caption}
      </span>
    </div>
  );
}

function RoundStep({ kind, onClick, label }: { kind: 'inc' | 'dec'; onClick: () => void; label: string }) {
  const Icon = kind === 'inc' ? Plus : Minus;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-90"
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

function blockTarget(block: Block): string {
  if (block.timed) return block.durationSeconds ? `${block.durationSeconds}s` : 'Timed';
  const sets = block.sets.length > 1 ? `${block.sets.length} × ` : '';
  return `${sets}${block.repText ?? 'reps'}`;
}

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
                            {blockTarget(block)}
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

function CoachNote({ text, label = 'COACH NOTE', subtle = false }: { text: string; label?: string; subtle?: boolean }) {
  return (
    <Card
      variant={subtle ? 'subtle' : 'default'}
      padding="12px"
      style={subtle ? undefined : { background: 'var(--bg-selected)', border: '1px solid var(--accent)' }}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles size={16} color="var(--accent-text)" className="mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-[10.5px] font-extrabold tracking-[0.06em]" style={{ color: 'var(--accent-text)' }}>
            {label}
          </div>
          <p className="mt-0.5 text-[13px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
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
