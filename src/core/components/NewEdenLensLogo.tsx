export function NewEdenLensLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="New Eden Lens"
    >
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        stroke="var(--eve-accent)"
        strokeWidth="3"
        fill="var(--eve-panel-elevated)"
      />
      <circle cx="32" cy="32" r="14" stroke="var(--eve-accent)" strokeWidth="2.5" opacity="0.85" />
      <circle cx="32" cy="32" r="5" fill="var(--eve-accent)" />
      <line x1="32" y1="10" x2="32" y2="18" stroke="var(--eve-accent)" strokeWidth="2" />
      <line x1="32" y1="46" x2="32" y2="54" stroke="var(--eve-accent)" strokeWidth="2" />
      <line x1="12" y1="32" x2="18" y2="32" stroke="var(--eve-accent)" strokeWidth="2" />
      <line x1="46" y1="32" x2="52" y2="32" stroke="var(--eve-accent)" strokeWidth="2" />
    </svg>
  );
}

