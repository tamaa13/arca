"use client";

import { Reveal } from "@/components/Reveal";

const STEPS = [
  {
    n: "01",
    t: "Connect your wallet",
    d: "Sign once. Arca derives your encryption key from that signature — never your private key.",
    tag: "sign once",
    tint: "#7d9fe6",
  },
  {
    n: "02",
    t: "Fund a little storage",
    d: "A small 0G deposit lets agents write under your wallet. ~0.1 0G ≈ 200 saves.",
    tag: "~0.1 0G",
    tint: "#e89a6b",
  },
  {
    n: "03",
    t: "Connect your agents",
    d: "Each agent connects with its own credential — sign-in or a token. Revoke any one on its own.",
    tag: "per agent",
    tint: "#5fc294",
  },
  {
    n: "04",
    t: "Save & recall anywhere",
    d: "Encrypted on 0G; recall from any agent. Save in your terminal, recall in your browser.",
    tag: "anywhere",
    tint: "#b58ad6",
  },
];

// pieterkoopt /stories effect: tall full-width cards pinned with sticky, each sticking a little
// lower so it rises and STACKS over the previous one as you scroll (the number strip peeks above).
export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 sm:px-8">
      <div className="py-20 sm:pt-28 sm:pb-16">
        <Reveal>
          <p className="font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">how it works</p>
          <h2 className="font-display mt-3 text-[clamp(28px,3.8vw,48px)] leading-[1.04] tracking-[-0.015em] text-[var(--color-ink)]">
            Set up in under a minute.
          </h2>
        </Reveal>
      </div>

      <div className="pb-[28vh]">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="sticky"
            style={{ top: `calc(84px + ${i} * 62px)`, zIndex: i + 1, marginBottom: 24 }}
          >
            <StepCard {...s} />
          </div>
        ))}
      </div>
    </section>
  );
}

function StepCard({
  n,
  t,
  d,
  tag,
  tint,
}: {
  n: string;
  t: string;
  d: string;
  tag: string;
  tint: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-[26px] border"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-paper)",
        boxShadow: "var(--shadow-doc)",
        minHeight: "56vh",
      }}
    >
      <div className="grid h-full min-h-[56vh] gap-8 p-7 sm:grid-cols-[1.25fr_1fr] sm:p-12">
        <div className="flex flex-col">
          <span className="font-display leading-none text-[var(--color-accent)]" style={{ fontSize: "clamp(38px,5vw,68px)" }}>
            {n}
          </span>
          <div className="mt-auto pt-12">
            <h3 className="font-display text-[clamp(26px,3.4vw,44px)] leading-[1.04] text-[var(--color-ink)]">{t}</h3>
            <p className="mt-4 max-w-[46ch] text-[14px] leading-[1.6] text-[var(--color-ink-2)]">{d}</p>
          </div>
        </div>

        {/* right: soft tinted panel with the step tag (stands in for pieter's imagery) */}
        <div
          className="relative hidden items-end justify-between overflow-hidden rounded-[18px] p-7 sm:flex"
          style={{
            background: `radial-gradient(120% 120% at 80% 0%, color-mix(in oklab, ${tint} 42%, transparent), transparent 70%), var(--color-cream-deep)`,
            border: "1px solid var(--color-border)",
          }}
        >
          <span
            aria-hidden
            className="font-display leading-none"
            style={{ fontSize: "clamp(80px,12vw,160px)", color: "color-mix(in oklab, var(--color-ink) 8%, transparent)" }}
          >
            {n}
          </span>
          <span className="font-mono-x text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--color-ink-2)" }}>
            {tag}
          </span>
        </div>
      </div>
    </div>
  );
}
