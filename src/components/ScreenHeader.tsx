import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
}

export default function ScreenHeader({ title, subtitle, rightActions }: ScreenHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          className="text-[26px] font-extrabold tracking-tight sm:text-[30px]"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 text-[14px] sm:text-[15px]" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {rightActions ? <div className="flex flex-shrink-0 items-center gap-2">{rightActions}</div> : null}
    </div>
  );
}
