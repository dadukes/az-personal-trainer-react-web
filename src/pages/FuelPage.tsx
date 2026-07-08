import { Apple, Flame, Upload, Utensils } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import ScreenHeader from '@/components/ScreenHeader';
import { Button, Card, Eyebrow } from '@/components/ui';
import {
  getDashboard,
  getNutritionLogs,
  logNutrition,
  type NutritionLogResponse,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

// Approximate BMR added to active calories for a display-only total burn estimate.
const ESTIMATED_BMR_KCAL = 1800;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

interface RecentMeal {
  id: string;
  description: string;
  calories: number | null;
  time: string;
}

function formatMealTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function FuelPage() {
  const { session } = useAuth();
  const { healthSnapshot } = useAppStore();

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [nutritionLog, setNutritionLog] = useState<NutritionLogResponse | null>(null);
  const [coachSuggestion, setCoachSuggestion] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentMeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeBurned = healthSnapshot.active_calories_burned ?? 0;
  const totalBurned = activeBurned > 0 ? activeBurned + ESTIMATED_BMR_KCAL : null;

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const result = await getDashboard(token);
        if (!mounted) return;
        const insight = result.data.pending_insights.find(
          (i) => i.insight_type === 'nutrition_tip' || i.insight_type === 'poor_diet',
        );
        if (insight) setCoachSuggestion(insight.payload.ai_message);
      } catch {
        // Non-blocking
      }
    })();
    void (async () => {
      try {
        const { logs } = await getNutritionLogs(token);
        if (!mounted) return;
        setRecent(
          logs.map((log) => ({
            id: log.id,
            description: log.meal_description,
            calories: log.estimated_calories,
            time: formatMealTime(log.logged_at),
          })),
        );
      } catch {
        // Non-blocking — fall back to an empty list until a meal is logged.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

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
      setNutritionLog(result);
      setRecent((prev) => [
        {
          id: result.id,
          description: result.meal_description,
          calories: result.estimated_calories,
          time: formatMealTime(result.logged_at),
        },
        ...prev.filter((meal) => meal.id !== result.id),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not analyse the photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1120px] animate-fade-slide-up flex-col gap-6 p-6 sm:p-10">
      <ScreenHeader title="Fuel." subtitle="Additions, not restrictions." />

      {/* Calorie snapshot */}
      <Card>
        <div className="flex">
          <div className="flex-1 text-center">
            <div className="mb-2 flex items-center justify-center gap-1.5">
              <Flame size={14} color="#39B1F2" />
              <Eyebrow>Burned</Eyebrow>
            </div>
            <div className="tabular text-[26px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {totalBurned != null ? totalBurned.toLocaleString() : '--'}
            </div>
            <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              Active + BMR
            </div>
          </div>
          <div className="mx-3 w-px" style={{ background: 'var(--border-base)' }} />
          <div className="flex-1 text-center">
            <div className="mb-2 flex items-center justify-center gap-1.5">
              <Apple size={14} color="#34D2C1" />
              <Eyebrow>Eaten</Eyebrow>
            </div>
            <div className="tabular text-[26px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {nutritionLog?.estimated_calories != null
                ? nutritionLog.estimated_calories.toLocaleString()
                : '--'}
            </div>
            <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {nutritionLog ? 'From latest log' : 'Snap a meal to track'}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left: result / suggestion + dropzone */}
        <div className="flex flex-1 flex-col gap-6 lg:flex-[1.4]">
          {nutritionLog ? (
            <Card variant="subtle">
              <strong className="text-[16px]" style={{ color: 'var(--text-primary)' }}>
                {nutritionLog.meal_description}
              </strong>
              <div className="mt-3 flex gap-2.5">
                {[
                  { label: 'Protein', value: `${nutritionLog.protein_g ?? '--'}g` },
                  { label: 'Carbs', value: `${nutritionLog.carbs_g ?? '--'}g` },
                  { label: 'Fat', value: `${nutritionLog.fat_g ?? '--'}g` },
                ].map((macro) => (
                  <div
                    key={macro.label}
                    className="flex-1 rounded-xl py-2.5 text-center"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                  >
                    <div className="tabular text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {macro.value}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {macro.label}
                    </div>
                  </div>
                ))}
              </div>
              {nutritionLog.ai_feedback ? (
                <p className="mt-3.5 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                  {nutritionLog.ai_feedback}
                </p>
              ) : null}
            </Card>
          ) : (
            <Card variant="subtle">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--forma-mint)' }}
                >
                  <Utensils size={18} color="#34D2C1" />
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    Coach&rsquo;s suggestion
                  </div>
                  <p className="mt-2 text-[13.5px] leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {coachSuggestion ??
                      'You are in a healthy deficit today. For recovery, try a high-protein snack before bed.'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div>
            <Eyebrow className="mb-3">Log a meal</Eyebrow>
            <div
              onDragOver={(e) => {
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
              className="flex flex-col items-center rounded-[24px] px-5 py-10 transition-colors"
              style={{
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: dragging ? 'var(--bg-selected)' : 'var(--bg-surface)',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
              {uploading ? (
                <>
                  <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                  <div className="text-[15px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Analysing your meal…
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="mb-3.5 flex h-[60px] w-[60px] items-center justify-center rounded-full"
                    style={{ background: 'var(--forma-mint)' }}
                  >
                    <Upload size={26} color="#34D2C1" />
                  </div>
                  <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    Drag &amp; drop a photo
                  </div>
                  <div className="mt-1.5 max-w-[340px] text-center text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
                    AI estimates macros and suggests healthy additions — no manual logging.
                  </div>
                  <div className="mt-4">
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                      Browse files
                    </Button>
                  </div>
                </>
              )}
            </div>
            {error ? (
              <div className="mt-3 text-[13px]" style={{ color: 'var(--forma-danger)' }}>
                {error}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: recent meals */}
        <div className="flex flex-col gap-3 lg:flex-[0.9]">
          <Eyebrow>Recent meals</Eyebrow>
          {recent.length === 0 ? (
            <Card padding="16px">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Snap a meal to start building your history — it&rsquo;ll show up here.
              </p>
            </Card>
          ) : (
            recent.map((meal) => (
              <Card key={meal.id} padding="14px 16px">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {meal.description}
                    </div>
                    <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      {meal.time}
                    </div>
                  </div>
                  <div className="tabular text-[13px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {meal.calories != null ? `${meal.calories.toLocaleString()} kcal` : '--'}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
