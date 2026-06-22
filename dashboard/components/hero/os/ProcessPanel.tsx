"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { zeroG } from "@/components/atoms/ZeroG";

// The "behind the scenes" of one op — Arca's encrypt-to-wallet, on-0G pipeline.
// Save = encrypt + store; recall = fetch + decrypt. Steps light up in sequence,
// synced to the terminal's save / the browser's recall.
const STEPS = {
  save: [
    { label: "sign", detail: "EIP-712 · your wallet" },
    { label: "derive key", detail: "HKDF-SHA256 · in-memory" },
    { label: "encrypt", detail: "AES-256-GCM" },
    { label: "store", detail: "0G Storage · root 0x9a…f2" },
    { label: "anchor", detail: "registry · tx 0x3b…7c" },
  ],
  recall: [
    { label: "authorize", detail: "connector token · this agent" },
    { label: "fetch", detail: "0G Storage · root 0x9a…f2" },
    { label: "derive key", detail: "HKDF-SHA256 · in-memory" },
    { label: "decrypt", detail: "AES-256-GCM" },
    { label: "match", detail: "2 memories returned" },
  ],
} as const;

const FOOTER = {
  save: "stored on 0G as ciphertext — encrypted to your wallet, recoverable with your wallet alone.",
  recall: "fetched from 0G and decrypted with your wallet-derived key.",
};

const STEP_MS = 1050;

export function ProcessPanel({
  play,
  variant = "save",
  startDelay = 0,
}: {
  play: boolean;
  variant?: "save" | "recall";
  startDelay?: number;
}) {
  const steps = STEPS[variant];
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!play) {
      setDone(0);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < steps.length; i++) {
      const n = i + 1;
      timers.push(setTimeout(() => setDone(n), startDelay + i * STEP_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [play, variant, startDelay, steps.length]);

  return (
    <div
      className="flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] p-4 shadow-[var(--shadow-card)]"
      style={{ fontFamily: "var(--font-body)" }}
    >
      <div className="mb-3 flex items-center gap-2 font-mono-x text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-3)]">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--color-accent)" }} />
        behind the scenes — {variant === "save" ? "saving" : "recalling"}
      </div>

      <div className="flex-1">
        {steps.map((s, i) => {
          const isDone = i < done;
          const isLast = i === steps.length - 1;
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
                  {zeroG(s.detail)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 border-t border-[var(--color-border)] pt-2 font-mono-x text-[9.5px] leading-[1.45]" style={{ color: "var(--color-ink-3)" }}>
        {zeroG(FOOTER[variant])}
      </div>
    </div>
  );
}
