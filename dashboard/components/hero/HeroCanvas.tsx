"use client";

import { useEffect, useState } from "react";
import { CYCLES } from "@/lib/cycles";
import { TuiCanvas } from "./TuiCanvas";

const CYCLE_MS = 10000;

// Framed terminal window that loops through the Arca story cycles.
export function HeroCanvas() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % CYCLES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);
  const cycle = CYCLES[i] ?? CYCLES[0];

  return (
    <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] shadow-[var(--shadow-doc)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <span className="flex gap-1.5">
          <Dot />
          <Dot />
          <Dot />
        </span>
        <span className="ml-1.5 font-mono-x text-[11px] tracking-[0.04em] text-[var(--color-ink-3)]">
          arca — your memory vault
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono-x text-[10px] text-[var(--color-ink-3)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3a8e5e" }} />
          live
        </span>
      </div>
      <TuiCanvas key={cycle.id} cycle={cycle} />
    </div>
  );
}

function Dot() {
  return <span className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]" />;
}
