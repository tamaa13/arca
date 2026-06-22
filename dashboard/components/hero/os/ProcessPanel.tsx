"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

// The "behind the scenes" of one save — Arca's operator-blind, on-0G pipeline.
// Steps light up in sequence, synced to the terminal's arca_save_memory call.
const STEPS = [
  { label: "sign", detail: "EIP-712 · your wallet" },
  { label: "derive key", detail: "HKDF-SHA256 · in-memory" },
  { label: "encrypt", detail: "AES-256-GCM" },
  { label: "store", detail: "0G Storage · root 0x9a…f2" },
  { label: "anchor", detail: "registry · tx 0x3b…7c" },
];
const STEP_MS = 1050;

export function ProcessPanel({ play, startDelay = 0 }: { play: boolean; startDelay?: number }) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!play) {
      setDone(0);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < STEPS.length; i++) {
      const n = i + 1;
      timers.push(setTimeout(() => setDone(n), startDelay + i * STEP_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [play, startDelay]);

  return (
    <div
      className="flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] p-4 shadow-[var(--shadow-card)]"
      style={{ fontFamily: "var(--font-body)" }}
    >
      <div className="mb-3 flex items-center gap-2 font-mono-x text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-3)]">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--color-accent)" }} />
        behind the scenes · on 0G
      </div>

      <div className="flex-1">
        {STEPS.map((s, i) => {
          const isDone = i < done;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
              {!isLast && (
                <span
                  className="absolute left-[7px] top-4 bottom-0 w-px"
                  style={{ background: isDone ? "var(--color-accent)" : "var(--color-border)" }}
                />
              )}
              <motion.span
                className="relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border text-[8px]"
                animate={{
                  borderColor: isDone ? "var(--color-accent)" : "var(--color-border-strong)",
                  backgroundColor: isDone ? "var(--color-accent)" : "rgba(0,0,0,0)",
                }}
                transition={{ duration: 0.3 }}
              >
                {isDone && <span style={{ color: "var(--color-cream)" }}>✓</span>}
              </motion.span>
              <div className="min-w-0">
                <div className="text-[12px]" style={{ color: isDone ? "var(--color-ink)" : "var(--color-ink-3)", fontWeight: isDone ? 600 : 400 }}>
                  {s.label}
                </div>
                <div className="font-mono-x text-[10px]" style={{ color: "var(--color-ink-3)" }}>
                  {s.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 border-t border-[var(--color-border)] pt-2 font-mono-x text-[9.5px] leading-[1.45]" style={{ color: "var(--color-ink-3)" }}>
        your key never leaves your device — the operator only ever stores ciphertext.
      </div>
    </div>
  );
}
