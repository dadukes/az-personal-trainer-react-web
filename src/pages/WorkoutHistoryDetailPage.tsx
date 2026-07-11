import { ChevronLeft, Clock, Dumbbell, Layers, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge, Card, Eyebrow, StatTile } from '@/components/ui';
import {
  getWorkoutSession,
  type WorkoutSection,
  type WorkoutSessionSummary,
  type WorkoutSetLogEntry,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const SECTION_LABELS: Record<WorkoutSection, string> = {
  warmup: 'Warm-up',
  main: 'Main',
  cooldown: 'Cool-down',
};

const SECTION_ORDER: WorkoutSection[] = ['warmup', 'main', 'cooldown'];

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One set formatted as a compact human string, e.g. "10 × 20 kg", "0:45", "12 reps". */
function formatSet(set: WorkoutSetLogEntry): string {
  if (set.duration_seconds != null && set.duration_seconds > 0) {
    const m = Math.floor(set.duration_seconds / 60);
    const s = set.duration_seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const reps = set.reps != null ? `${set.reps}` : '—';
  if (set.weight != null && set.weight > 0) {
    return `${reps} × ${set.weight} ${set.weight_unit ?? 'kg'}`;
  }
  return set.reps != null ? `${reps} reps` : '—';
}

interface ExerciseGroup {
  key: string;
  name: string;
  swappedFrom: string | null;
  skipped: boolean;
  sets: WorkoutSetLogEntry[];
}

/** Group a section's set rows by exercise, preserving first-seen order. */
function groupBySection(sets: WorkoutSetLogEntry[]): Record<WorkoutSection, ExerciseGroup[]> {
  const bySection: Record<WorkoutSection, ExerciseGroup[]> = {
    warmup: [],
    main: [],
    cooldown: [],
  };
  const index = new Map<string, ExerciseGroup>();

  for (const set of sets) {
    const section = set.section;
    const key = `${section}|${set.exercise_id ?? set.name}`;
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        name: set.name,
        swappedFrom: set.swapped_from,
        skipped: set.skipped,
        sets: [],
      };
      index.set(key, group);
      bySection[section].push(group);
    }
    group.sets.push(set);
    // A group is only "skipped" if every one of its sets was skipped.
    group.skipped = group.skipped && set.skipped;
  }

  return bySection;
}

export default function WorkoutHistoryDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [data, setData] = useState<{ session: WorkoutSessionSummary; sets: WorkoutSetLogEntry[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || !id) return;
    const token = session.access_token;
    let mounted = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await getWorkoutSession(token, id);
        if (mounted) setData({ session: result.session, sets: result.sets ?? [] });
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load this workout.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session, id]);

  const grouped = data ? groupBySection(data.sets) : null;
  const completedSets = data ? data.sets.filter((s) => s.completed).length : 0;

  return (
    <div className="mx-auto flex w-full max-w-[760px] animate-fade-slide-up flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/progress/workouts')}
          aria-label="Back to workout history"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div>
          <Eyebrow>Workout history</Eyebrow>
          <div className="text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {data?.session.day ? capitalize(data.session.day) : 'Workout'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : error || !data || !grouped ? (
        <Card>
          <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
            {error ?? 'This workout could not be found.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            {formatSessionDate(data.session.completed_at)}
          </div>

          {/* Session summary tiles */}
          <div className="flex gap-3">
            <StatTile
              value={formatDuration(data.session.duration_seconds)}
              label="Duration"
              icon={<Clock size={16} color="#34D2C1" />}
            />
            <StatTile
              value={String(completedSets)}
              label="Sets completed"
              icon={<Layers size={16} color="#34D2C1" />}
            />
            <StatTile
              value={data.session.xp_earned > 0 ? `+${data.session.xp_earned}` : '—'}
              label="XP earned"
              icon={<Zap size={16} color="#34D2C1" />}
            />
          </div>

          {/* Logged exercises grouped by section */}
          {SECTION_ORDER.map((section) => {
            const groups = grouped[section];
            if (groups.length === 0) return null;
            return (
              <div key={section} className="flex flex-col gap-3">
                <Eyebrow>{SECTION_LABELS[section]}</Eyebrow>
                {groups.map((group) => (
                  <Card key={group.key} padding="16px 18px">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{ background: 'var(--bg-subtle)' }}
                      >
                        <Dumbbell size={18} color="#34D2C1" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                            {group.name}
                          </span>
                          {group.skipped ? <Badge tone="neutral">Skipped</Badge> : null}
                        </div>
                        {group.swappedFrom ? (
                          <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                            Swapped from {group.swappedFrom}
                          </div>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {group.sets.map((set) => (
                            <SetPill key={set.id} set={set} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function SetPill({ set }: { set: WorkoutSetLogEntry }): ReactNode {
  const done = set.completed && !set.skipped;
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
      style={{
        background: done ? 'var(--bg-selected)' : 'var(--bg-subtle)',
        border: `1px solid ${done ? 'var(--accent)' : 'var(--border-subtle)'}`,
        opacity: set.skipped ? 0.55 : 1,
      }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-[0.04em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {set.set_number}
      </span>
      <span
        className="tabular text-[12.5px] font-semibold"
        style={{ color: done ? 'var(--text-on-mint)' : 'var(--text-secondary)' }}
      >
        {formatSet(set)}
      </span>
    </div>
  );
}
