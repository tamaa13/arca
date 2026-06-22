"use client";

import { Reveal } from "@/components/Reveal";

// Honest positioning — every line scoped to what's true today (e.g. "at rest").
const CLAIMS = [
  {
    k: "01",
    t: "Sealed to your wallet",
    d: "Encrypted to your wallet and stored on 0G — at rest it's ciphertext only you can open. Recoverable with your wallet alone; no one can rug it.",
  },
  {
    k: "02",
    t: "Every agent, one memory",
    d: "Save in your terminal, recall in your browser. Any MCP client — CLI, web, or IDE — reads and writes the same memory.",
  },
  {
    k: "03",
    t: "Revoke on its own",
    d: "Each agent connects with its own credential. If one is compromised, cut just that one — the rest keep working.",
  },
  {
    k: "04",
    t: "Never your private key",
    d: "You sign once; Arca derives your encryption key from that signature — never your private key, and it's never stored at rest.",
  },
];

export function Claims() {
  return (
    <section id="why" className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <p className="font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">why arca</p>
        <h2 className="font-display mt-3 text-[clamp(28px,3.6vw,46px)] leading-[1.05] tracking-[-0.015em] text-[var(--color-ink)]">
          Your memory. Yours alone.
        </h2>
        <p className="mt-4 max-w-[58ch] text-[14px] leading-[1.6] text-[var(--color-ink-2)]">
          Most AI memory lives in someone else&apos;s database — they can read it, lose it, or lock you out.
          Arca encrypts your memory to your wallet and stores it on 0G, so it&apos;s portable across every
          agent and can&apos;t be taken from you.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {CLAIMS.map((c) => (
            <div
              key={c.k}
              className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-card)]"
            >
              <span className="font-mono-x text-[11px] text-[var(--color-accent)]">{c.k}</span>
              <h3 className="font-display text-[21px] leading-tight text-[var(--color-ink)]">{c.t}</h3>
              <p className="text-[13px] leading-[1.6] text-[var(--color-ink-2)]">{c.d}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <p className="mt-6 max-w-[60ch] font-mono-x text-[11px] leading-[1.6] text-[var(--color-ink-3)]">
          Next: operator-blind — the service runs inside a 0G TEE so not even the host can read your key
          or memory. Proven feasible on testnet, rolling out.
        </p>
      </Reveal>
    </section>
  );
}
