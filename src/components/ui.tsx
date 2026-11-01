import { Check, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// ─── Button ───────────────────────────────────────────────────────────────────
// Primary = aqua fill for the one main action. Strong = navy. Quiet = tonal.
// Link = text only. Press scales down for a springy, tactile feel.

export type ButtonVariant = 'primary' | 'strong' | 'quiet' | 'link' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-12 px-5 text-[15px] gap-2',
  lg: 'h-14 px-6 text-[17px] gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  leftIcon,
  className = '',
  children,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-button font-bold transition-transform duration-100 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed select-none';

  const variantStyle: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--aqua)', color: 'var(--on-aqua)' },
    strong: { background: 'var(--ink)', color: 'var(--ground)' },
    quiet: { background: 'var(--sunken)', color: 'var(--ink)' },
    link: { background: 'transparent', color: 'var(--teal)' },
    danger: { background: 'var(--danger-fill)', color: 'var(--on-danger)' },
  };

  return (
    <button
      className={`${base} ${BTN_SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ ...variantStyle[variant], ...style }}
      disabled={disabled}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
// The older card, with a hairline border. New screens use `Surface`, and existing ones
// move over as they're redesigned.

interface CardProps {
  variant?: 'default' | 'subtle';
  padding?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  children: ReactNode;
}

export function Card({
  variant = 'default',
  padding = '20px',
  className = '',
  style,
  onClick,
  children,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-surface ${onClick ? 'cursor-pointer transition-transform active:scale-[0.99]' : ''} ${className}`}
      style={{
        background: variant === 'subtle' ? 'var(--bg-subtle)' : 'var(--bg-surface)',
        border: `1px solid ${variant === 'subtle' ? 'var(--border-subtle)' : 'var(--border-base)'}`,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', style, ...rest }: InputProps) {
  return (
    <label className="block">
      {label ? (
        <span
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: 'var(--text-label)' }}
        >
          {label}
        </span>
      ) : null}
      <input
        className={`w-full rounded-xl px-4 text-[15px] outline-none transition-colors placeholder:opacity-70 focus:border-[var(--accent)] ${className}`}
        style={{
          height: 48,
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-base)',
          color: 'var(--text-primary)',
          ...style,
        }}
        {...rest}
      />
    </label>
  );
}

// ─── Segmented ────────────────────────────────────────────────────────────────

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `sm` shrink-wraps to its labels, for toolbar or header placement rather than a full row. */
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedProps<T>) {
  const segmentSize = size === 'sm' ? 'px-2.5 py-1.5 text-[12.5px]' : 'flex-1 min-h-11 px-2 py-2.5 text-sm';
  return (
    <div role="tablist" className={`flex gap-1 rounded-control p-1 ${className}`} style={{ background: 'var(--sunken)' }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`whitespace-nowrap rounded-lg font-bold transition-colors ${segmentSize}`}
            style={{
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-2)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Chip({ active, onClick, disabled, className = '', style, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-transform active:scale-[0.96] disabled:opacity-50 ${className}`}
      style={{
        background: active ? 'var(--bg-selected)' : 'var(--bg-subtle-alt)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-base)'}`,
        color: active ? 'var(--text-on-mint)' : 'var(--text-secondary)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── StatTile ─────────────────────────────────────────────────────────────────

interface StatTileProps {
  value: string;
  label: string;
  icon?: ReactNode;
  className?: string;
  /** When provided the tile becomes a button (springy press + pointer cursor). */
  onClick?: () => void;
}

export function StatTile({ value, label, icon, className = '', onClick }: StatTileProps) {
  const inner = (
    <>
      {icon ? <div className="mb-2">{icon}</div> : null}
      <div className="tabular text-[22px] font-extrabold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] leading-tight" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
    </>
  );
  const tileStyle = { background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' } as const;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 rounded-2xl p-4 text-left transition-transform active:scale-[0.97] ${className}`}
        style={tileStyle}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={`flex-1 rounded-2xl p-4 ${className}`} style={tileStyle}>
      {inner}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'navy' | 'mint' | 'gold';

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className = '', children }: BadgeProps) {
  const styles: Record<BadgeTone, CSSProperties> = {
    neutral: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-base)',
      color: 'var(--text-label)',
    },
    navy: { background: 'var(--hero)', color: 'var(--aqua)' },
    mint: { background: 'var(--bg-selected)', color: 'var(--text-on-mint)' },
    gold: { background: 'var(--sunken)', color: 'var(--gold)' },
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] ${className}`}
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

interface AvatarProps {
  initial: string;
  size?: number;
  className?: string;
}

export function Avatar({ initial, size = 36, className = '' }: AvatarProps) {
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-extrabold text-white ${className}`}
      style={{ width: size, height: size, background: 'var(--forma-gradient)', fontSize: size * 0.42 }}
    >
      {initial.toUpperCase()}
    </div>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number; // 0-100
  gradient?: boolean;
  className?: string;
}

export function ProgressBar({ value, gradient = true, className = '' }: ProgressBarProps) {
  return (
    <div
      className={`h-3 w-full overflow-hidden rounded-full ${className}`}
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: gradient ? 'var(--forma-gradient)' : 'var(--accent)',
        }}
      />
    </div>
  );
}

// ─── ChatBubble ───────────────────────────────────────────────────────────────

interface ChatBubbleProps {
  role: 'coach' | 'user';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function ChatBubble({ role, className = '', style, children }: ChatBubbleProps) {
  const isUser = role === 'user';
  return (
    <div
      className={`max-w-[640px] rounded-2xl px-4 py-3 text-[14px] leading-6 ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'} ${className}`}
      style={{
        background: isUser ? 'var(--accent)' : 'var(--bg-surface)',
        color: isUser ? 'var(--text-on-accent)' : 'var(--text-secondary)',
        border: isUser ? 'none' : '1px solid var(--border-base)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Eyebrow (uppercase section label) ────────────────────────────────────────

export function Eyebrow({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`text-[11px] font-bold uppercase tracking-[0.09em] ${className}`}
      style={{ color: 'var(--text-label)' }}
    >
      {children}
    </div>
  );
}

// ─── Surface ──────────────────────────────────────────────────────────────────
// The one card level. Depth comes from tone, not outlines, and a Surface never goes inside
// another Surface. Lists are one Surface holding `Row`s.

interface SurfaceProps {
  /** `hero` is the one navy card per screen. */
  tone?: 'surface' | 'hero';
  padding?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Surface({ tone = 'surface', padding = '20px', className = '', style, children }: SurfaceProps) {
  const isHero = tone === 'hero';
  return (
    <div
      className={`${isHero ? 'rounded-hero' : 'rounded-surface'} ${className}`}
      style={{
        background: isHero ? 'var(--hero)' : 'var(--surface)',
        color: isHero ? 'var(--hero-ink)' : undefined,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Stat ─────────────────────────────────────────────────────────────────────

interface StatProps {
  /** No value means nothing renders: a stat is never shown as "--" or a stand-in zero. */
  value: string | number | null | undefined;
  label: string;
  size?: 'stat' | 'display' | 'live';
  className?: string;
}

export function Stat({ value, label, size = 'stat', className = '' }: StatProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`flex flex-col gap-[3px] ${className}`}>
      <span className={`type-${size}`} style={{ color: 'var(--ink)' }}>
        {value}
      </span>
      <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  /** Sits at the end of the row. A clickable row with none shows a chevron. */
  trailing?: ReactNode;
  /** The first row in a list has no divider above it. */
  first?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

/** One line of a list. Rows sit on a single `Surface` with hairlines between them. */
export function Row({ title, meta, leading, trailing, first, selected, onClick }: RowProps) {
  const layout = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left';
  const style: CSSProperties = {
    borderTop: first ? undefined : '1px solid var(--line)',
    background: selected ? 'var(--tint)' : 'transparent',
  };
  const content = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body font-semibold" style={{ color: selected ? 'var(--teal)' : 'var(--ink)' }}>
          {title}
        </span>
        {meta ? (
          <span className="type-meta" style={{ color: selected ? 'var(--ink-2)' : 'var(--ink-3)' }}>
            {meta}
          </span>
        ) : null}
      </span>
      {trailing ?? (onClick ? <ChevronRight size={18} color="var(--ink-3)" className="flex-shrink-0" /> : null)}
    </>
  );
  if (!onClick) {
    return (
      <div className={layout} style={style}>
        {content}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-current={selected || undefined} className={layout} style={style}>
      {content}
    </button>
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A bottom sheet below `sm` and a centred dialog above. Escape or clicking outside closes it. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5"
      style={{ background: 'var(--scrim)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-hero sm:max-w-[480px] sm:rounded-hero"
        style={{ background: 'var(--surface)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between pl-5 pr-2 pt-2">
          <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center"
          >
            <X size={20} color="var(--ink-2)" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-6 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ─── StatusTick ───────────────────────────────────────────────────────────────

export type TickStatus = 'done' | 'today' | 'planned' | 'rest';

interface StatusTickProps {
  status: TickStatus;
  /** Shown inside every status except `done`, usually the day of the month. */
  label?: string;
  size?: number;
  /** Activity outside the plan: a sky dot underneath, never the plan's tick. */
  otherActivity?: boolean;
}

const STATUS_NAMES: Record<TickStatus, string> = {
  done: 'Done',
  today: 'Today',
  planned: 'Planned',
  rest: 'Rest',
};

const TICK_STYLES: Record<TickStatus, CSSProperties> = {
  done: { background: 'var(--aqua)', color: 'var(--on-aqua)' },
  today: { background: 'var(--ink)', color: 'var(--ground)' },
  planned: { border: '2px solid var(--line)', color: 'var(--ink)' },
  rest: { color: 'var(--ink-3)' },
};

export function StatusTick({ status, label, size = 36, otherActivity }: StatusTickProps) {
  const name = `${STATUS_NAMES[status]}${label ? `, ${label}` : ''}${otherActivity ? ', other activity' : ''}`;
  return (
    <span role="img" aria-label={name} className="inline-flex flex-col items-center gap-1">
      <span
        className="flex items-center justify-center rounded-full font-bold"
        style={{ width: size, height: size, fontSize: size * 0.4, ...TICK_STYLES[status] }}
      >
        {status === 'done' ? <Check size={size / 2} strokeWidth={3} /> : label}
      </span>
      {otherActivity ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--sky-fill)' }} />
      ) : null}
    </span>
  );
}
