"use client";

import { Reveal } from "@/components/Reveal";
import { ParallaxCard } from "@/components/ParallaxCard";

const STEPS = [
  {
    n: "01",
    t: "Connect your wallet",
    d: "Sign once. Arca derives your encryption key from that signature — never your private key.",
    tag: "sign once",
  },
  {
    n: "02",
    t: "Fund a little storage",
    d: "A small 0G deposit lets agents write under your wallet. ~0.1 0G ≈ 200 saves.",
    tag: "~0.1 0G",
  },
  {
    n: "03",
    t: "Connect your agents",
    d: "Each agent connects with its own credential — sign-in or a token. Revoke any one on its own.",
    tag: "per agent",
  },
  {
    n: "04",
    t: "Save & recall anywhere",
    d: "Encrypted on 0G; recall from any agent. Save in your terminal, recall in your browser.",
    tag: "anywhere",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <p className="font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">how it works</p>
        <h2 className="font-display mt-3 text-[clamp(28px,3.8vw,48px)] leading-[1.04] tracking-[-0.015em] text-[var(--color-ink)]">
          Set up in under a minute.
        </h2>
      </Reveal>

      {/* pieterkoopt-style parallax cards — each step floats at its own depth + leans to the cursor. */}
      <div className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.05} className="h-full">
            <ParallaxCard index={i} travel={14} className="h-full">
              <StepCard {...s} />
            </ParallaxCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function StepCard({ n, t, d, tag }: { n: string; t: string; d: string; tag: string }) {
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-card)] transition-colors duration-300 hover:border-[var(--color-border-strong)]">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[clamp(34px,3vw,46px)] leading-none text-[var(--color-ink-3)] transition-colors duration-300 group-hover:text-[var(--color-accent)]">
          {n}
        </span>
        <span className="font-mono-x text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-3)]">{tag}</span>
      </div>
      <h3 className="font-display mt-5 text-[20px] leading-tight text-[var(--color-ink)]">{t}</h3>
      <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-ink-2)]">{d}</p>
      <span
        aria-hidden
        className="mt-auto pt-5 text-[var(--color-ink-3)] transition-all duration-300 group-hover:translate-x-1 group-hover:text-[var(--color-accent)]"
      >
        →
      </span>
    </div>
  );
}
