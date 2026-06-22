"use client";

import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";
import { zeroG } from "@/components/atoms/ZeroG";

const STEPS = [
  {
    n: "01",
    t: "Connect your wallet",
    d: "Sign once. Arca derives your encryption key from that signature — never your private key.",
    tag: "sign once",
    tint: "#7d9fe6",
    icon: <WalletIcon />,
  },
  {
    n: "02",
    t: "Fund a little storage",
    d: "A small 0G deposit lets agents write under your wallet. ~0.1 0G ≈ 200 saves.",
    tag: "~0.1 0G",
    tint: "#e89a6b",
    icon: <CoinIcon />,
  },
  {
    n: "03",
    t: "Connect your agents",
    d: "Each agent connects with its own credential — sign-in or a token. Revoke any one on its own.",
    tag: "per agent",
    tint: "#5fc294",
    icon: <PlugIcon />,
  },
  {
    n: "04",
    t: "Save & recall anywhere",
    d: "Encrypted on 0G; recall from any agent. Save in your terminal, recall in your browser.",
    tag: "anywhere",
    tint: "#b58ad6",
    icon: <SyncIcon />,
  },
];

// Sticky stacking cards — each pins a little lower so it rises and STACKS over the previous one
// as you scroll. The number + title sit at the top so they read in the peek strip when stacked.
export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 sm:px-8">
      <div className="py-20 sm:pt-28 sm:pb-14">
        <Reveal>
          <p className="font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">how it works</p>
          <h2 className="font-display mt-3 text-[clamp(28px,3.8vw,48px)] leading-[1.04] tracking-[-0.015em] text-[var(--color-ink)]">
            Set up in under a minute.
          </h2>
        </Reveal>
      </div>

      <div className="pb-[18vh]">
        {STEPS.map((s, i) => (
          <div key={s.n} className="sticky" style={{ top: `calc(86px + ${i} * 74px)`, zIndex: i + 1, marginBottom: 22 }}>
            <StepCard {...s} />
          </div>
        ))}
      </div>
    </section>
  );
}

function StepCard({ n, t, d, tag, tint, icon }: { n: string; t: string; d: string; tag: string; tint: string; icon: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[24px] border"
      style={{ borderColor: "var(--color-border)", background: "var(--color-paper)", boxShadow: "var(--shadow-doc)", minHeight: "clamp(248px,32vh,312px)" }}
    >
      <div className="grid h-full sm:grid-cols-[1fr_auto]" style={{ minHeight: "inherit" }}>
        {/* content — the focus */}
        <div className="flex flex-col p-7 sm:p-9">
          <div className="flex items-center gap-4">
            <span className="font-display leading-[0.9] text-[var(--color-accent)]" style={{ fontSize: "clamp(34px,3.4vw,52px)" }}>
              {n}
            </span>
            <h3 className="font-display text-[clamp(22px,2.5vw,34px)] leading-[1.05] text-[var(--color-ink)]">{t}</h3>
          </div>
          <p className="mt-4 max-w-[48ch] text-[14px] leading-[1.6] text-[var(--color-ink-2)]">{zeroG(d)}</p>
          <span
            className="mt-auto inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono-x text-[10px] uppercase tracking-[0.16em]"
            style={{ borderColor: "var(--color-border-strong)", color: "var(--color-ink-2)" }}
          >
            {zeroG(tag)}
          </span>
        </div>

        {/* tinted icon panel — moderate width, not a big empty area */}
        <div
          className="relative hidden w-[clamp(190px,20vw,260px)] items-center justify-center overflow-hidden rounded-[18px] sm:flex"
          style={{
            margin: 12,
            background: `radial-gradient(120% 120% at 70% 20%, color-mix(in oklab, ${tint} 46%, transparent), transparent 72%), var(--color-cream-deep)`,
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ color: `color-mix(in oklab, ${tint} 78%, var(--color-ink))`, width: "clamp(56px,7vw,84px)", display: "block" }}>
            {icon}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── simple line icons (inherit width from the wrapper, currentColor stroke) ──
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "auto" }} aria-hidden>
      {children}
    </svg>
  );
}
function WalletIcon() {
  return (
    <Svg>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 9h18" />
      <circle cx="16.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}
function CoinIcon() {
  return (
    <Svg>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
      <path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
    </Svg>
  );
}
function PlugIcon() {
  return (
    <Svg>
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M7 8h10v3a5 5 0 0 1-10 0z" />
      <path d="M12 16v5" />
    </Svg>
  );
}
function SyncIcon() {
  return (
    <Svg>
      <path d="M20 11a8 8 0 0 0-14-4.5L3 9" />
      <path d="M3 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14 4.5L21 15" />
      <path d="M21 20v-5h-5" />
    </Svg>
  );
}
