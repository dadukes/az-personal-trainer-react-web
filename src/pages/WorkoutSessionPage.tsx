import { Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import LogbookView from '@/components/LogbookView';
import { Button, Eyebrow } from '@/components/ui';
import { getDashboard, userSafeError, type WeightUnit } from '@/lib/api';
import { dateForDayKey } from '@/lib/workout';
import { createDraft, newClientSessionId, updateDraft, type WorkoutDraft } from '@/lib/workoutDraft';
import { discardActiveDraft, getActiveDraft, initWorkoutLocal, saveActiveDraft } from '@/lib/workoutSync';
import {
  applyBlockSwap,
  buildBlocks,
  signatureOf,
  type Block,
  type BlockSwap,
  type SetActual,
} from '@/lib/workoutSession';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Where a workout in progress lived before `workoutSync`. Only read, once, to carry it over. */
const LEGACY_SESSION_KEY = 'forma:workout-session';
/** Which session's coach note has already been shown, so it auto-opens only once. */
const NOTE_SEEN_KEY = 'forma:workout-note-seen';

function resolveDayKey(param?: string): string {
  if (param && DAY_KEYS.includes(param)) return param;
  return DAY_KEYS[new Date().getDay()];
}

/** The older stored shape: per-set progress only, with the blocks rebuilt from the plan. */
interface LegacySession {
  planId?: string;
  dayKey: string;
  startedAt: string;
  signature: string;
  sets: SetActual[][];
  swaps?: Record<string, BlockSwap>;
}

/** Hands over a workout stored by the previous version of this page, and clears it. */
function takeLegacySession(): LegacySession | null {
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    return raw ? (JSON.parse(raw) as LegacySession) : null;
  } catch {
    return null;
  }
}

export default function WorkoutSessionPage() {
  const { day } = useParams<{ day: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const profile = useAppStore((s) => s.profile);
  const unit: WeightUnit = profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg';
  const dayKey = resolveDayKey(day);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [planId, setPlanId] = useState<string | undefined>();
  const [dayNotes, setDayNotes] = useState<string | undefined>();
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [focus, setFocus] = useState<string | undefined>();
  const [clientSessionId, setClientSessionId] = useState(newClientSessionId);
  /** A workout in progress for a different day, which has to be dealt with before starting this one. */
  const [otherDraft, setOtherDraft] = useState<WorkoutDraft | null>(null);
  const [finishOpen] = useState(() => searchParams.get('finish') === '1');
  const [noteOpen, setNoteOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const restoredRef = useRef(false);
  /** Once the workout is on screen, a token refresh must not reload anything under it. */
  const openRef = useRef(false);
  const draftRef = useRef<WorkoutDraft | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!session?.access_token) {
        setError('You need to be signed in to start a workout.');
        setLoading(false);
        return;
      }
      if (openRef.current) return;
      initWorkoutLocal(session.user.id);

      // The workout in progress reopens as it was left: it needs neither the plan nor a
      // network, and a plan changed since can't throw it away.
      const draft = getActiveDraft();
      if (draft?.dayKey === dayKey) {
        openRef.current = true;
        draftRef.current = draft;
        restoredRef.current = true;
        setOtherDraft(null);
        setClientSessionId(draft.clientSessionId);
        setPlanId(draft.planId);
        setFocus(draft.focus);
        setDayNotes(draft.dayNotes);
        setStartedAt(new Date(draft.startedAt));
        setBlocks(draft.blocks);
        setLoading(false);
        return;
      }
      setOtherDraft(draft);

      try {
        const result = await getDashboard(session.access_token);
        if (!active) return;
        const plan = result.data.active_workout_plan;
        const dp = plan?.plan?.[dayKey] ?? null;
        setPlanId(plan?.id);
        setDayNotes(dp?.ai_notes);
        setFocus(dp?.focus);
        const fresh = dp && !dp.is_rest_day ? buildBlocks(dp, unit) : [];

        // A workout stored by the previous version of this page carries over once.
        const legacy = takeLegacySession();
        if (
          fresh.length > 0 &&
          legacy &&
          legacy.dayKey === dayKey &&
          legacy.planId === plan?.id &&
          legacy.signature === signatureOf(fresh)
        ) {
          fresh.forEach((b, bi) => {
            const savedSets = legacy.sets[bi];
            if (savedSets) {
              b.sets = b.sets.map((s, si) => savedSets[si] ?? s);
            }
            const swap = legacy.swaps?.[b.key];
            if (swap) fresh[bi] = applyBlockSwap(b, swap);
          });
          setStartedAt(new Date(legacy.startedAt));
        } else {
          setStartedAt(new Date());
        }
        restoredRef.current = true;
        // Not while another day's workout is waiting on a decision: resuming that one has to
        // be able to load it.
        if (fresh.length > 0 && !draft) openRef.current = true;
        setBlocks(fresh);
      } catch (err) {
        if (active) setError(userSafeError(err, 'Could not load your workout. Check your connection and try again.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, dayKey, unit]);

  /**
   * The coach's intention for the session is worth reading once, when the workout
   * starts — after that it lives behind the header info button instead of repeating
   * above every exercise.
   */
  useEffect(() => {
    if (loading || !dayNotes || blocks.length === 0) return;
    const key = `${planId ?? 'none'}|${dayKey}|${dateForDayKey(dayKey)}`;
    try {
      if (localStorage.getItem(NOTE_SEEN_KEY) === key) return;
      localStorage.setItem(NOTE_SEEN_KEY, key);
    } catch {
      // Storage unavailable — showing it once per load is an acceptable fallback.
    }
    setNoteOpen(true);
  }, [loading, dayNotes, blocks.length, planId, dayKey]);

  // Every change is written straight away, so closing the tab at any moment loses nothing.
  // Not while another day's workout is waiting to be resumed or discarded: this one hasn't
  // started yet, and writing it would replace that one.
  useEffect(() => {
    if (!restoredRef.current || finished || !startedAt || blocks.length === 0 || otherDraft) return;
    // A new workout can only take over once the stored one has been dealt with.
    const stored = getActiveDraft();
    if (!draftRef.current && stored && stored.clientSessionId !== clientSessionId) return;
    const current =
      draftRef.current ??
      createDraft({
        clientSessionId,
        planId,
        dayKey,
        focus,
        dayNotes,
        startedAt: startedAt.toISOString(),
        blocks,
      });
    const next = { ...updateDraft(current, blocks, new Date().toISOString()), startedAt: startedAt.toISOString() };
    draftRef.current = next;
    saveActiveDraft(next);
  }, [blocks, clientSessionId, planId, dayKey, focus, dayNotes, startedAt, finished, otherDraft]);

  // Wall-clock timer: derive elapsed from the start time so backgrounding/screen-lock
  // (which throttles JS timers) never loses accumulated workout time.
  useEffect(() => {
    if (finished || !startedAt || otherDraft) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [finished, startedAt, otherDraft]);

  /** A workout is on screen and not yet logged, so leaving needs a decision about it. */
  const guardExit = !loading && !error && !finished && !otherDraft && blocks.length > 0;

  /**
   * Back-navigation guard. The app nav is hidden during a workout, but the browser's
   * own Back (and Android's system back) still points straight out of the session — and
   * nothing is logged until the user finishes. So we park a sentinel history entry and
   * turn any pop into the confirm dialog, re-parking it each time they choose to stay.
   */
  useEffect(() => {
    if (!guardExit) return;
    window.history.pushState({ formaWorkoutGuard: true }, '');
    const onPop = () => {
      window.history.pushState({ formaWorkoutGuard: true }, '');
      setExitOpen(true);
    };
    // Covers tab close / reload, which no in-page dialog can intercept.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [guardExit]);

  /**
   * The one way out mid-session. Home rather than `-1`: `-1` is the sentinel entry.
   * The sets are already stored, so this keeps the workout for Home to resume.
   */
  const leaveWorkout = useCallback(() => {
    setExitOpen(false);
    navigate('/', { replace: true });
  }, [navigate]);

  const discardAndLeave = useCallback(() => {
    discardActiveDraft();
    leaveWorkout();
  }, [leaveWorkout]);

  const requestExit = useCallback(() => {
    if (guardExit) {
      setExitOpen(true);
      return;
    }
    navigate(-1);
  }, [guardExit, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (otherDraft) {
    return (
      <OtherWorkoutDialog
        dayKey={otherDraft.dayKey}
        onResume={() => {
          // This day's blocks are still in state until the route changes. Nothing may be
          // written from them, or they'd replace the workout being resumed.
          restoredRef.current = false;
          setBlocks([]);
          setLoading(true);
          navigate(`/workout/${otherDraft.dayKey}`, { replace: true });
        }}
        onBack={() => navigate('/', { replace: true })}
        onDiscard={() => {
          discardActiveDraft();
          openRef.current = true;
          setOtherDraft(null);
          setStartedAt(new Date());
        }}
      />
    );
  }

  if (error || blocks.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center justify-center gap-3 p-10 text-center" style={{ minHeight: '60vh' }}>
        <div className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {error ? 'Something went wrong' : 'Nothing scheduled'}
        </div>
        <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
          {error ?? 'There is no workout planned for this day. Enjoy your rest!'}
        </p>
        <Button variant="quiet" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <>
      <LogbookView
        blocks={blocks}
        setBlocks={setBlocks}
        planId={planId}
        dayKey={dayKey}
        focus={focus}
        startedAt={startedAt ?? new Date()}
        setStartedAt={setStartedAt}
        elapsed={elapsed}
        clientSessionId={clientSessionId}
        accessToken={session?.access_token}
        askToFinish={finishOpen}
        finished={finished}
        onFinished={() => setFinished(true)}
        exitOpen={exitOpen}
        onRequestExit={requestExit}
        onStay={() => setExitOpen(false)}
        onLeave={leaveWorkout}
        onDiscard={discardAndLeave}
        onDone={() => navigate('/')}
      />
      {noteOpen && dayNotes ? <SessionNoteDialog text={dayNotes} onClose={() => setNoteOpen(false)} /> : null}
    </>
  );
}


function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Shared frame for the two questions below. */
function WorkoutQuestionDialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'var(--scrim)' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Starting a workout while another day's is unfinished would otherwise replace it. */
function OtherWorkoutDialog({
  dayKey,
  onResume,
  onBack,
  onDiscard,
}: {
  dayKey: string;
  onResume: () => void;
  onBack: () => void;
  onDiscard: () => void;
}) {
  return (
    <WorkoutQuestionDialog title="You have a workout in progress">
      <p className="text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
        Your {capitalize(dayKey)} workout isn&rsquo;t finished yet. Starting this one would throw it away.
      </p>
      <div className="mt-2 flex flex-col gap-2.5">
        <Button fullWidth onClick={onResume}>
          Resume {capitalize(dayKey)}
        </Button>
        <Button variant="quiet" fullWidth onClick={onBack}>
          Not now
        </Button>
        <Button variant="link" fullWidth onClick={onDiscard}>
          <span style={{ color: 'var(--forma-danger)' }}>Discard it and start this one</span>
        </Button>
      </div>
    </WorkoutQuestionDialog>
  );
}


/**
 * The coach's plan for the whole session. Shown once on start and thereafter on
 * demand from the header, so the same paragraph doesn't sit above every exercise.
 */
function SessionNoteDialog({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'var(--scrim)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Coach's plan for this session"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-selected)' }}
          >
            <Sparkles size={18} color="var(--text-on-mint)" />
          </div>
          <div className="min-w-0 flex-1">
            <Eyebrow>Coach&rsquo;s plan today</Eyebrow>
            <p className="mt-1.5 text-[14px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
              {text}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
          >
            <X size={16} color="var(--text-secondary)" />
          </button>
        </div>
        <Button fullWidth className="mt-5" onClick={onClose}>
          Let&rsquo;s go
        </Button>
      </div>
    </div>
  );
}






