"use client";

import { useSound } from "./SoundProvider";

// Navbar control: an animated equalizer when sound is on, a muted speaker when off.
export function SoundToggle() {
  const { soundOn, toggle } = useSound();
  return (
    <button
      onClick={toggle}
      aria-label={soundOn ? "Mute ambient sound" : "Play ambient sound"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors"
      // padding:0 beats the unlayered global `button { padding }` that would otherwise clip the icon
      style={{ padding: 0, background: "transparent", border: "1px solid var(--color-border-strong)", color: "var(--color-ink)" }}
    >
      {soundOn ? <Bars /> : <Muted />}
    </button>
  );
}

function Bars() {
  return (
    <span className="flex items-end gap-[2px]" style={{ height: 12 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full"
          style={{
            background: "var(--color-ink)",
            height: 12,
            transformOrigin: "bottom",
            animation: `arca-eq 0.9s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes arca-eq{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}`}</style>
    </span>
  );
}

function Muted() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M22 9l-6 6M16 9l6 6" />
    </svg>
  );
}
