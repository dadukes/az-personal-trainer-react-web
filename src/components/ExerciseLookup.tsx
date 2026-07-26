import { Globe, MonitorPlay } from 'lucide-react';

/**
 * Build the YouTube results URL for an exercise. YouTube is the primary lookup
 * because form guidance is overwhelmingly video — a still image or a paragraph
 * rarely answers "am I doing this right?".
 */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to ${name} proper form`)}`;
}

/** Build the Google results URL for an exercise (secondary lookup). */
export function googleSearchUrl(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} exercise how to`)}`;
}

interface ExerciseLookupProps {
  name: string;
  /**
   * Emphasised styling for the case where we have no catalog match at all, so the
   * lookup is the user's only route to form guidance rather than a supplement.
   */
  prominent?: boolean;
}

/**
 * "Look it up" escape hatch: links that search the web for the exercise by name.
 * Catalog coverage will never be complete, so every exercise gets a route out to
 * the wider web. New tab (`_blank` + `noreferrer`) keeps the workout in place —
 * important on the guided session route, where losing progress is a real cost.
 */
export function ExerciseLookup({ name, prominent = false }: ExerciseLookupProps) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return (
    <div className="flex gap-2">
      <LookupLink
        href={youtubeSearchUrl(trimmed)}
        label="Watch on YouTube"
        icon={<MonitorPlay size={15} />}
        filled={prominent}
        className="flex-[2]"
      />
      <LookupLink
        href={googleSearchUrl(trimmed)}
        label="Google"
        icon={<Globe size={15} />}
        className="flex-1"
      />
    </div>
  );
}

function LookupLink({
  href,
  label,
  icon,
  filled = false,
  className,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  filled?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center justify-center gap-2 truncate rounded-xl px-3 py-2.5 text-[13px] font-bold active:scale-[0.98] ${className ?? ''}`}
      style={
        filled
          ? {
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              border: '1px solid var(--accent)',
            }
          : {
              background: 'var(--bg-surface)',
              color: 'var(--accent-text)',
              border: '1px solid var(--border-base)',
            }
      }
    >
      {icon}
      {label}
    </a>
  );
}
