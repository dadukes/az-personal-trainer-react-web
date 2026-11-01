import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button, Row, Segmented, Sheet, Stat, StatusTick, Surface } from '@/components/ui';
import { useAppTheme } from '@/providers/ThemeProvider';

const SWATCHES = [
  'ground',
  'surface',
  'sunken',
  'line',
  'ink',
  'ink-2',
  'ink-3',
  'aqua',
  'teal',
  'tint',
  'sky',
  'gold',
  'danger',
  'hero',
] as const;

const TYPE_SAMPLES = [
  { name: 'type-live', sample: '22.5' },
  { name: 'type-display', sample: 'Upper Body B' },
  { name: 'type-stat', sample: '6,240' },
  { name: 'type-screen-title', sample: 'Good morning' },
  { name: 'type-section-title', sample: 'This week' },
  { name: 'type-body', sample: 'Dumbbell Bench Press' },
  { name: 'type-meta', sample: 'Tue · 31 min · 17 sets' },
] as const;

/** Every Forma Signal token and component in the current theme. Dev builds, or the flag. */
export default function DesignSystemPage() {
  const { isDark, toggleTheme } = useAppTheme();
  const [segment, setSegment] = useState('week');
  const [sheetOpen, setSheetOpen] = useState(false);
  const noop = () => undefined;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-6">
      <header className="flex items-center justify-between">
        <h1 className="type-screen-title m-0" style={{ color: 'var(--ink)' }}>
          Forma Signal
        </h1>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Switch theme"
          className="flex h-11 w-11 items-center justify-center"
        >
          {isDark ? <Sun size={22} color="var(--ink)" /> : <Moon size={22} color="var(--ink)" />}
        </button>
      </header>

      <Surface tone="hero" className="flex flex-col gap-3">
        <span className="type-meta" style={{ color: 'var(--hero-sub)' }}>
          Today · 45 min
        </span>
        <span className="type-display">Upper Body B</span>
        <Button size="lg" onClick={noop}>
          Start workout
        </Button>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          Colour
        </h2>
        <div className="flex flex-wrap gap-3">
          {SWATCHES.map((name) => (
            <div key={name} className="flex w-16 flex-col gap-1">
              <span
                className="h-11 rounded-control"
                style={{ background: `var(--${name})`, border: '1px solid var(--line)' }}
              />
              <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          Type
        </h2>
        {TYPE_SAMPLES.map(({ name, sample }) => (
          <div key={name} className="flex flex-col gap-1">
            <span className={name} style={{ color: 'var(--ink)' }}>
              {sample}
            </span>
            <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
              {name}
            </span>
          </div>
        ))}
      </Surface>

      <Surface className="flex flex-col gap-2.5">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          Buttons
        </h2>
        <Button size="lg" fullWidth onClick={noop}>
          Primary
        </Button>
        <Button variant="strong" fullWidth onClick={noop}>
          Strong secondary
        </Button>
        <Button variant="quiet" fullWidth onClick={noop}>
          Quiet
        </Button>
        <Button variant="danger" fullWidth onClick={noop}>
          Danger
        </Button>
        <Button variant="link" fullWidth onClick={noop}>
          Text link
        </Button>
      </Surface>

      <Surface className="flex flex-col gap-4">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          Stat
        </h2>
        <Stat size="display" value="78.4 kg" label="7-day average" />
        <Stat value={58} label="Resting HR" />
        <Stat value={null} label="This one has no data, so it renders nothing" />
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          Status ticks
        </h2>
        <div className="flex gap-2">
          <StatusTick status="done" />
          <StatusTick status="today" label="5" />
          <StatusTick status="planned" label="6" />
          <StatusTick status="rest" label="7" otherActivity />
        </div>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          Segmented
        </h2>
        <Segmented
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </Surface>

      <Surface padding="0" className="overflow-hidden">
        <Row first title="Dumbbell Bench Press" meta="4 sets · 10 reps" onClick={noop} />
        <Row title="Open a sheet" meta="A row that opens the Sheet" onClick={() => setSheetOpen(true)} />
        <Row selected title="A selected row" meta="On the tint" onClick={noop} />
        <Row title="A row with no action" meta="Plain text only" />
      </Surface>

      <Sheet open={sheetOpen} title="A sheet" onClose={() => setSheetOpen(false)}>
        <p className="type-body m-0" style={{ color: 'var(--ink-2)' }}>
          Sheets slide up over a scrim on a phone, and sit in the middle on a wider screen.
        </p>
        <Button fullWidth onClick={() => setSheetOpen(false)}>
          Done
        </Button>
      </Sheet>
    </div>
  );
}
