import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: string;
  /** One short line under the title; leave it out when the title says enough. */
  subtitle?: string;
  rightActions?: ReactNode;
}

/** A page's title: plain on the ground, no card. Mobile twin: `screen-header`. */
export default function ScreenHeader({ title, subtitle, rightActions }: ScreenHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="type-screen-title m-0" style={{ color: 'var(--ink)' }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="m-0 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {rightActions ? <div className="flex flex-shrink-0 items-center gap-1">{rightActions}</div> : null}
    </div>
  );
}
