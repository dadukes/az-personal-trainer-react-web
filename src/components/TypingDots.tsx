export default function TypingDots({ color = 'var(--accent)' }: { color?: string }) {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: color, animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}
