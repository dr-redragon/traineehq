/**
 * The app's mark: a register page with one row ticked. Drawn rather than
 * loaded so it is sharp at any size and takes the accent from the theme.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M12 16h10M12 32h10" stroke="currentColor" strokeWidth="4" opacity=".45" />
      <path d="M12 24h10" stroke="currentColor" strokeWidth="4" />
      <path d="M27 24.5l4.5 4.5L39 19" fill="none" stroke="hsl(var(--rule-accent))" strokeWidth="4.5" />
    </svg>
  );
}
