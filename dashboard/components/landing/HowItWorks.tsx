"use client";

import { Reveal } from "@/components/Reveal";

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

      {/* Editorial index list à la pieterkoopt.nl/stories: full-width rows, hairline
          dividers, big serif numbers + titles, a "→" CTA that reveals on hover. */}
      <div className="mt-12 flex flex-col border-b border-[var(--color-border)] sm:mt-16">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.05}>
            <StoryRow {...s} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function StoryRow({ n, t, d, tag }: { n: string; t: string; d: string; tag: string }) {
  return (
    <div className="group relative grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-2 border-t border-[var(--color-border)] py-7 sm:grid-cols-[auto_1fr_auto] sm:gap-x-10 sm:py-10">
      <span className="font-display text-[clamp(30px,4.4vw,58px)] leading-none text-[var(--color-ink-3)] transition-colors duration-300 group-hover:text-[var(--color-accent)]">
        {n}
      </span>

      <div className="transition-transform duration-300 ease-out group-hover:translate-x-1.5">
        <h3 className="font-display text-[clamp(21px,2.6vw,32px)] leading-tight text-[var(--color-ink)]">{t}</h3>
        <p className="mt-2 max-w-[54ch] text-[13.5px] leading-[1.65] text-[var(--color-ink-2)]">{d}</p>
      </div>

      <div className="col-start-2 mt-1 flex items-center gap-2 sm:col-start-3 sm:mt-0 sm:self-center">
        <span className="font-mono-x text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">{tag}</span>
        <span
          aria-hidden
          className="text-[var(--color-ink-3)] transition-all duration-300 group-hover:translate-x-1 group-hover:text-[var(--color-accent)]"
        >
          →
        </span>
      </div>
    </div>
  );
}
