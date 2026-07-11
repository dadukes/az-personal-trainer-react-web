import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react';

// ─── Button ───────────────────────────────────────────────────────────────────
// Primary = solid aqua fill with navy label. Secondary = bordered surface.
// Ghost = borderless. Press scales down for a springy, tactile feel.

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-[52px] px-6 text-[15px] gap-2',
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
    'inline-flex items-center justify-center rounded-xl font-bold transition-transform duration-100 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed select-none';

  const variantStyle: CSSProperties =
    variant === 'primary'
      ? { background: 'var(--accent)', color: 'var(--text-on-accent)', boxShadow: '0 6px 18px rgba(52,210,193,0.28)' }
      : variant === 'secondary'
        ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }
        : variant === 'danger'
          ? { background: 'var(--forma-danger)', color: '#fff' }
          : { background: 'transparent', color: 'var(--text-secondary)' };

  return (
    <button
      className={`${base} ${BTN_SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ ...variantStyle, ...style }}
      disabled={disabled}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
// The defining element: 24px radius, 1px hairline border, generous padding.

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
      className={`rounded-[24px] ${onClick ? 'cursor-pointer transition-transform active:scale-[0.99]' : ''} ${className}`}
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

// ─── SegmentedToggle ──────────────────────────────────────────────────────────

export interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedToggleProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  tone?: 'default' | 'mint';
  className?: string;
}

export function SegmentedToggle({
  options,
  value,
  onChange,
  tone = 'default',
  className = '',
}: SegmentedToggleProps) {
  return (
    <div
      className={`flex gap-1 rounded-xl p-1 ${className}`}
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const activeBg = tone === 'mint' ? 'var(--bg-selected)' : 'var(--bg-surface)';
        const activeColor = tone === 'mint' ? 'var(--text-on-mint)' : 'var(--text-primary)';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex-1 rounded-lg py-2.5 text-sm font-bold transition-all"
            style={{
              background: active ? activeBg : 'transparent',
              color: active ? activeColor : 'var(--text-muted)',
              boxShadow: active && tone !== 'mint' ? 'var(--shadow-sm)' : undefined,
              border: active && tone === 'mint' ? '1px solid var(--accent)' : '1px solid transparent',
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
    navy: { background: '#134F62', color: 'var(--forma-aqua)' },
    mint: { background: 'var(--bg-selected)', color: 'var(--text-on-mint)' },
    gold: { background: 'rgba(245,197,66,0.16)', color: '#B8860B' },
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
