import { Clock, Dumbbell, Layers, MapPin, MessageCircle, Watch, Weight, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ActivityRow from '@/components/ActivityRow';
import DetailHeader, { useBackToActivities } from '@/components/DetailHeader';
import HeartRateCard from '@/components/HeartRateCard';
import { Badge, Card, Eyebrow, StatTile } from '@/components/ui';
import { sourceAppLabel } from '@/lib/body';
import { formatDistance, timeRangeText, workoutDurationSeconds, workoutTitle, workoutVolume } from '@/lib/activities';
import {
  getWorkoutSession,
  type WorkoutSection,
  type WorkoutSessionDetailResponse,
  type WorkoutSetLogEntry,
} from '@/lib/api';
import { weightText } from '@/lib/exercise';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const SECTION_LABELS: Record<WorkoutSection, string> = {
  warmup: 'Warm-up',
  main: 'Main',
  cooldown: 'Cool-down',
};

const SECTION_ORDER: WorkoutSection[] = ['warmup', 'main', 'cooldown'];

function formatDuration(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * One set formatted as a compact human string, e.g. "10 × 20 kg", "0:45 · 24 kg",
 * "0:45", "12 reps".
 *
 * A timed set carries its duration *and* its load independently, so a weighted carry
 * shows both — dropping the weight here would hide the only number that moves between
 * one carry and the next.
 */
function formatSet(set: WorkoutSetLogEntry): string {
  const load = weightText(set.weight, set.weight_unit);
  if (set.duration_seconds != null && set.duration_seconds > 0) {
    const m = Math.floor(set.duration_seconds / 60);
    const s = set.duration_seconds % 60;
    const clock = `${m}:${String(s).padStart(2, '0')}`;
    return load ? `${clock} · ${load}` : clock;
  }
  const reps = set.reps != null ? `${set.reps}` : '—';
  if (load) return `${reps} × ${load}`;
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

/**
 * `/activities/workout/:id` — one guided workout: duration, sets and XP, the heart rate
 * from a watch recording of the same session (linked on import) and every logged set,
 * grouped by section. A plan day the user reported to the coach has no sets.
 */
export default function WorkoutDetailPage() {
  const navigate = useNavigate();
  const goBack = useBackToActivities();
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const unitSystem = useAppStore((s) => s.profile.preferred_unit_system);

  const [data, setData] = useState<WorkoutSessionDetailResponse | null>(null);
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
        if (mounted) setData({ ...result, sets: result.sets ?? [] });
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
  const volume = data ? workoutVolume(data.sets, unitSystem) : null;
  // A plan day told to the coach, or completed by a watch recording, has no set logs.
  const source = data?.source ?? (data && data.session.total_sets === 0 ? 'coach' : 'app');
  const noSets = !!data && data.sets.length === 0 && source !== 'app';
  const recordings = data?.recordings ?? [];
  const distanceKm = recordings.reduce((sum, r) => sum + (r.distance_km ?? 0), 0);
  const durationSeconds = data ? workoutDurationSeconds(data.session.duration_seconds, recordings) : 0;
  // The coach stamps the time the user told it; a recording knows when it happened.
  const shownStart = recordings[0]?.started_at ?? (source === 'coach' ? null : data?.session.started_at ?? null);
  const shownEnd = recordings.length > 0 ? recordings[recordings.length - 1].completed_at : data?.session.completed_at ?? '';

  return (
    <div className="mx-auto flex w-full max-w-[760px] animate-fade-slide-up flex-col gap-5 p-5 sm:p-8">
      <DetailHeader
        eyebrow="Planned workout"
        title={data ? workoutTitle({ title: data.title, day: data.session.day }) : 'Workout'}
        onBack={goBack}
      />

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
            {timeRangeText(shownStart, shownEnd)}
          </div>

          {/* Session summary tiles */}
          <div className={`grid grid-cols-2 gap-3 ${volume || distanceKm > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <StatTile
              value={durationSeconds > 0 ? formatDuration(durationSeconds) : '—'}
              label="Duration"
              icon={<Clock size={16} color="#34D2C1" />}
            />
            {distanceKm > 0 ? (
              <StatTile value={formatDistance(distanceKm, unitSystem, 2)} label="Distance" icon={<MapPin size={16} color="#34D2C1" />} />
            ) : null}
            {!noSets ? (
              <StatTile
                value={String(completedSets)}
                label="Sets completed"
                icon={<Layers size={16} color="#34D2C1" />}
              />
            ) : null}
            {volume ? <StatTile value={volume} label="Volume" icon={<Weight size={16} color="#34D2C1" />} /> : null}
            <StatTile
              value={data.session.xp_earned > 0 ? `+${data.session.xp_earned}` : '—'}
              label="XP earned"
              icon={<Zap size={16} color="#34D2C1" />}
            />
          </div>

          {data.heart_rate ? (
            <HeartRateCard
              avgHr={data.heart_rate.avg_hr}
              maxHr={data.heart_rate.max_hr}
              secondsInZone={data.heart_rate.seconds_in_zone}
              zoneModel={data.zone_model}
              sourceLabel={sourceAppLabel(data.heart_rate.source_app)}
              onAddBirthYear={() => navigate('/profile')}
            />
          ) : null}

          {/* A plan day told to the coach or completed by the watch has no per-set detail — an
              empty set table would read as "nothing happened", so state plainly what it is. */}
          {noSets ? (
            <Card padding="16px 18px">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  {source === 'watch' ? <Watch size={18} color="#34D2C1" /> : <MessageCircle size={18} color="#34D2C1" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {source === 'watch' ? 'Completed on your watch' : 'Logged with your coach'}
                    </span>
                    <Badge tone="mint">{source === 'watch' ? 'Plan day done' : 'Coach-logged'}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                    {source === 'watch'
                      ? `${sourceAppLabel(recordings[0]?.source_app ?? null)} recorded this, so the planned day is ticked off. There’s no set-by-set breakdown.`
                      : recordings.length > 0
                        ? `You told your coach about this one and ${sourceAppLabel(recordings[0].source_app)} recorded it. It counts once towards your week.`
                        : 'You told your coach about this one in chat, so there’s no set-by-set breakdown — it still counts towards your week.'}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          {recordings.length > 0 ? (
            <div className="flex flex-col gap-3">
              <Eyebrow>Recorded on your watch</Eyebrow>
              {recordings.map((r) => (
                <ActivityRow key={r.id} item={r} unitSystem={unitSystem} detailed />
              ))}
            </div>
          ) : null}

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
