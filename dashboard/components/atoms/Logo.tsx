// The Arca memory SVG mark.
export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 30 30">
      <rect x="3" y="6" width="24" height="20" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="3" y1="12.5" x2="27" y2="12.5" stroke="var(--ink)" strokeWidth="1.5" />
      <rect x="12.5" y="15" width="5" height="5" fill="var(--accent)" />
    </svg>
  );
}
