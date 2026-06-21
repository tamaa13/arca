import type { CSSProperties } from "react";

interface KeyValueProps {
  label: string;
  value: string;
  style?: CSSProperties;
}

// Mirrors the legacy `.kv` row: a mono uppercase label + a mono code value.
export function KeyValue({ label, value, style }: KeyValueProps) {
  return (
    <div className="kv" style={style}>
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
