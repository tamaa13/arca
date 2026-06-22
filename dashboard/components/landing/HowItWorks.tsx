"use client";

import { Reveal } from "@/components/Reveal";

const STEPS = [
  { n: "01", t: "Connect your wallet", d: "Sign once. Arca derives your encryption key from that signature — never your private key." },
  { n: "02", t: "Fund a little storage", d: "A small 0G deposit lets agents write under your wallet. ~0.1 0G ≈ 200 saves." },
  { n: "03", t: "Connect your agents", d: "Each agent connects with its own credential — sign-in or a token. Revoke any one on its own." },
  { n: "04", t: "Save & recall anywhere", d: "Encrypted on 0G; recall from any agent. Save in your terminal, recall in your browser." },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <p className="font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">how it works</p>
        <h2 className="font-display mt-3 text-[clamp(28px,3.6vw,46px)] leading-[1.05] tracking-[-0.015em] text-[var(--color-ink)]">
          Set up in under a minute.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.06}>
            <div className="flex h-full flex-col gap-3 border-t-2 border-[var(--color-ink)] pt-4">
              <span className="font-display text-[40px] leading-none text-[var(--color-accent)]">{s.n}</span>
              <h3 className="font-display text-[20px] leading-tight text-[var(--color-ink)]">{s.t}</h3>
              <p className="text-[13px] leading-[1.6] text-[var(--color-ink-2)]">{s.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
