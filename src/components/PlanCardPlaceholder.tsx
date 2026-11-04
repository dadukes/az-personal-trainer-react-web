/**
 * Where the plan card will land, shown once the coach starts changing the
 * plan and replaced by the real card (`SuggestionCard`) when it arrives.
 */
export default function PlanCardPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Putting your plan together"
      className="flex flex-col gap-3 rounded-[20px] p-4 sm:p-5"
      style={{ background: 'var(--surface)' }}
    >
      <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>
        Putting your plan together…
      </span>
      {[72, 88, 64, 80].map((width, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="block h-3.5 animate-pulse rounded-full"
          style={{ width: `${width}%`, background: 'var(--sunken)', animationDelay: `${i * 0.12}s` }}
        />
      ))}
      <span aria-hidden="true" className="block h-12 w-full animate-pulse rounded-[14px]" style={{ background: 'var(--sunken)' }} />
    </div>
  );
}
