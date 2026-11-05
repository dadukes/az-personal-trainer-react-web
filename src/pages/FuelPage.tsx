import { Camera, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import ScreenHeader from '@/components/ScreenHeader';
import { Row, Surface } from '@/components/ui';
import {
  getBodyMeasurements,
  getDashboard,
  getNutritionLogs,
  logNutrition,
  type NutritionLogEntry,
  type NutritionLogResponse,
} from '@/lib/api';
import { burnedSoFar, eatenShare, mealsOn, mealTotals, restingKcal } from '@/lib/fuel';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

type Meal = Pick<NutritionLogEntry, 'id' | 'logged_at' | 'meal_description' | 'estimated_calories' | 'protein_g' | 'carbs_g' | 'fat_g'>;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function localISODate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "1:10 PM" today, else "Mon 1:10 PM". */
function mealTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/**
 * Fuel: today's eating against an honest estimate of what was burned, a photo to log a
 * meal, the coach's real tip when there is one, and today's meals. Burned is a resting
 * estimate from the profile and weight plus active calories, shown only when all of it is
 * known (`lib/fuel.ts`). Mobile twin: `app/(tabs)/fuel.tsx`.
 */
export default function FuelPage() {
  // Dragging a file in only works with a mouse, so a phone gets different wording.
  const canDragAndDrop = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const { session } = useAuth();
  const healthSnapshot = useAppStore((s) => s.healthSnapshot);
  const profile = useAppStore((s) => s.profile);
  const snapshotWeight = useAppStore((s) => s.progressSnapshot?.weight?.latest_kg ?? null);

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lastResult, setLastResult] = useState<NutritionLogResponse | null>(null);
  const [coachTip, setCoachTip] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const result = await getDashboard(token);
        const insight = result.data.pending_insights.find(
          (i) => i.insight_type === 'nutrition_tip' || i.insight_type === 'poor_diet',
        );
        if (mounted && insight) setCoachTip(insight.payload.ai_message);
      } catch {
        // Non-blocking: no tip shows.
      }
    })();
    void (async () => {
      try {
        const { logs } = await getNutritionLogs(token, 30);
        if (mounted) setMeals(logs);
      } catch {
        // Non-blocking: the list stays empty until a meal is logged.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  // The resting estimate needs a weight; the latest weigh-in will do when Progress hasn't loaded.
  useEffect(() => {
    if (!session?.access_token || snapshotWeight != null) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const { measurements } = await getBodyMeasurements(token, { metric: 'weight_kg', limit: 1 });
        if (mounted) setLatestWeight(measurements[0]?.value ?? null);
      } catch {
        // Non-blocking: Burned stays hidden without a weight.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session, snapshotWeight]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (!session?.access_token) {
      setError('Please sign in to log meals.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const imageBase64 = await readFileAsDataUrl(file);
      const result = await logNutrition(session.access_token, { image_base64: imageBase64 });
      setLastResult(result);
      setMeals((prev) => [result, ...prev.filter((m) => m.id !== result.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const today = localISODate();
  const todays = mealsOn(meals, today);
  const totals = mealTotals(todays);
  const now = new Date();
  const activeKcal = healthSnapshot.active_calories_burned;
  const resting = restingKcal({
    weightKg: snapshotWeight ?? latestWeight,
    heightCm: profile.height_cm,
    birthYear: profile.birth_year,
    sex: profile.sex,
    year: now.getFullYear(),
  });
  const burned = burnedSoFar(resting, activeKcal, now);
  const listed = todays.length > 0 ? todays : meals.slice(0, 5);
  const macros = [
    { label: 'Protein', value: totals.protein },
    { label: 'Carbs', value: totals.carbs },
    { label: 'Fat', value: totals.fat },
  ].filter((m) => m.value != null);

  return (
    <div className="mx-auto flex w-full max-w-[680px] animate-fade-slide-up flex-col gap-6 px-4 pb-28 pt-6 sm:px-10 sm:pt-10">
      <ScreenHeader title="Fuel." subtitle="Additions, not restrictions." />

      {/* Energy today */}
      <Surface padding="18px 16px 16px" className="flex flex-col gap-3.5" style={{ borderRadius: 'var(--radius-hero)' }}>
        <div className="flex justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
              Eaten today
            </span>
            {totals.kcal != null ? (
              <span className="type-display" style={{ color: 'var(--ink)' }}>
                {totals.kcal.toLocaleString()}
              </span>
            ) : (
              <span className="type-body" style={{ color: 'var(--ink-2)' }}>
                No meals logged yet
              </span>
            )}
          </div>
          {burned != null ? (
            <div className="flex flex-col items-end gap-1">
              <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
                Burned so far
              </span>
              <span className="type-display" style={{ color: 'var(--ink-2)' }}>
                {burned.toLocaleString()}
              </span>
            </div>
          ) : null}
        </div>
        {totals.kcal != null && burned != null ? (
          <div
            role="progressbar"
            aria-valuenow={eatenShare(totals.kcal, burned)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${totals.kcal} of ${burned} kilocalories eaten against burned`}
            className="h-2 overflow-hidden rounded"
            style={{ background: 'var(--sunken)' }}
          >
            <div className="h-2 rounded" style={{ width: `${eatenShare(totals.kcal, burned)}%`, background: 'var(--aqua)' }} />
          </div>
        ) : null}
        {macros.length > 0 ? (
          <dl className="m-0 grid grid-cols-3 gap-2">
            {macros.map((m) => (
              <div key={m.label} className="flex flex-col-reverse gap-0.5">
                <dt className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                  {m.label}
                </dt>
                <dd className="type-stat m-0 text-[26px]" style={{ color: 'var(--ink)' }}>
                  {m.value} g
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {burned == null && activeKcal ? (
          <span className="type-meta" style={{ color: 'var(--ink-2)' }}>
            {Math.round(activeKcal).toLocaleString()} kcal active today
          </span>
        ) : null}
        {resting == null ? (
          <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
            Add your height, birth year and sex in Profile, and a weigh-in, to see what you&apos;ve burned.
          </span>
        ) : null}
      </Surface>

      {/* Log a meal */}
      <section aria-label="Log a meal" className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => (canDragAndDrop ? libraryInputRef : fileInputRef).current?.click()}
          disabled={uploading}
          onDragOver={(e) => {
            if (!canDragAndDrop) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className="flex h-16 items-center justify-center gap-3 rounded-[18px] text-[18px] font-bold transition-transform active:scale-[0.98] disabled:opacity-70"
          style={{ background: 'var(--aqua)', color: 'var(--on-aqua)', boxShadow: dragging ? 'inset 0 0 0 3px var(--ink)' : undefined }}
        >
          {uploading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--on-aqua)', borderTopColor: 'transparent' }} />
          ) : (
            <Camera size={24} strokeWidth={2.2} aria-hidden />
          )}
          {uploading ? 'Reading your meal…' : canDragAndDrop ? 'Add a meal photo' : 'Snap a meal'}
        </button>
        {!canDragAndDrop ? (
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            disabled={uploading}
            className="min-h-11 text-[14px] font-semibold"
            style={{ color: 'var(--ink-2)' }}
          >
            Choose from library
          </button>
        ) : null}
        <p className="type-meta m-0 text-center" style={{ color: 'var(--ink-3)' }}>
          {canDragAndDrop ? 'Or drop a photo on the button. ' : ''}AI estimates macros and suggests healthy additions, with no
          manual logging.
        </p>
        {error ? (
          <p className="type-meta m-0 text-center" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : null}
      </section>

      {/* What the photo just found */}
      {lastResult?.ai_feedback ? (
        <Surface padding="16px" className="flex flex-col gap-1.5">
          <span className="type-meta font-bold" style={{ color: 'var(--ink-3)' }}>
            Just logged
          </span>
          <span className="type-body font-semibold" style={{ color: 'var(--ink)' }}>
            {lastResult.meal_description}
          </span>
          <p className="m-0 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
            {lastResult.ai_feedback}
          </p>
        </Surface>
      ) : null}

      {/* The coach's tip: only a real one */}
      {coachTip ? (
        <section aria-label="From your coach" className="flex flex-col gap-2 rounded-surface p-4" style={{ background: 'var(--tint)' }}>
          <h2 className="m-0 flex items-center gap-2 text-[13px] font-bold" style={{ color: 'var(--teal)' }}>
            <Sparkles size={16} aria-hidden /> From your coach
          </h2>
          <p className="type-body m-0" style={{ color: 'var(--ink)' }}>
            {coachTip}
          </p>
        </section>
      ) : null}

      {/* Meals */}
      {listed.length > 0 ? (
        <section aria-label="Meals" className="flex flex-col gap-3">
          <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
            {todays.length > 0 ? "Today's meals" : 'Recent meals'}
          </h2>
          <Surface padding="2px 0">
            {listed.map((meal, i) => (
              <Row
                key={meal.id}
                first={i === 0}
                title={meal.meal_description}
                titleLines={2}
                meta={mealTime(meal.logged_at)}
                leading={
                  <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-control" style={{ background: 'var(--sunken)' }}>
                    <ImageIcon size={20} color="var(--ink-3)" />
                  </span>
                }
                trailing={
                  meal.estimated_calories != null ? (
                    <span className="type-stat flex-none text-[22px]" style={{ color: 'var(--ink)' }}>
                      {Math.round(meal.estimated_calories).toLocaleString()}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </Surface>
        </section>
      ) : null}
    </div>
  );
}
