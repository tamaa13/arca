"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { zeroG } from "@/components/atoms/ZeroG";

type Item = { k: string; t: string; d: string };

// Fanned deck (pieterkoopt-style): cards stacked like a hand, the front flips to the back on
// click or auto-advance. 3D fan + spring so it reads as flipping through a deck.
const FAN = [
  { y: 0, x: 0, rotZ: 0, rotY: 0, scale: 1 },
  { y: -18, x: 13, rotZ: 4.5, rotY: -9, scale: 0.965 },
  { y: -34, x: -11, rotZ: -5.5, rotY: 9, scale: 0.93 },
  { y: -48, x: 6, rotZ: 3, rotY: -5, scale: 0.9 },
];

export function CardDeck({ items }: { items: Item[] }) {
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const [paused, setPaused] = useState(false);
  const advance = useCallback(() => setOrder((o) => [...o.slice(1), o[0]]), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(advance, 4200);
    return () => clearInterval(id);
  }, [paused, advance]);

  const top = order[0];

  return (
    <div className="relative">
      <div
        className="relative mx-auto h-[340px] w-full max-w-[440px] cursor-pointer select-none sm:h-[380px]"
        style={{ perspective: 1500 }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label="Flip to the next reason"
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && advance()}
      >
        {items.map((it, i) => {
          const depth = order.indexOf(i);
          const f = FAN[Math.min(depth, FAN.length - 1)];
          return (
            <motion.div
              key={it.k}
              className="absolute inset-0"
              style={{ transformStyle: "preserve-3d", transformOrigin: "center bottom", zIndex: items.length - depth }}
              animate={{ y: f.y, x: f.x, rotateZ: f.rotZ, rotateY: f.rotY, scale: f.scale, opacity: depth > 2 ? 0 : 1 }}
              transition={{ type: "spring", stiffness: 230, damping: 26 }}
            >
              <DeckCard it={it} index={i} total={items.length} />
            </motion.div>
          );
        })}
      </div>

      <div className="mt-7 flex items-center justify-center gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            aria-label={`Reason ${i + 1}`}
            onClick={() => setOrder([...items.map((_, j) => j).slice(i), ...items.map((_, j) => j).slice(0, i)])}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{ width: i === top ? 22 : 6, background: i === top ? "var(--color-accent)" : "var(--color-border-strong)", border: "none", padding: 0, cursor: "pointer" }}
          />
        ))}
      </div>
    </div>
  );
}

function DeckCard({ it, index, total }: { it: Item; index: number; total: number }) {
  return (
    <div
      className="flex h-full flex-col justify-between rounded-[22px] border p-7 sm:p-8"
      style={{ borderColor: "var(--color-border)", background: "var(--color-paper)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono-x text-[12px] text-[var(--color-accent)]">{it.k}</span>
        <span className="font-mono-x text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          {index + 1} / {total}
        </span>
      </div>
      <div>
        <h3 className="font-display text-[clamp(25px,3.2vw,38px)] leading-[1.06] text-[var(--color-ink)]">{it.t}</h3>
        <p className="mt-4 max-w-[42ch] text-[13.5px] leading-[1.6] text-[var(--color-ink-2)]">{zeroG(it.d)}</p>
      </div>
      <span className="font-mono-x text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-3)]">tap to flip →</span>
    </div>
  );
}
