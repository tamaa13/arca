"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { EASE } from "@/lib/motion";
import { OsScene } from "./os/OsScene";

const lineVariants = {
  hidden: { opacity: 0, y: 26, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.85, ease: EASE } },
};

// Generic agent KINDS (no brand names) — the cycle itself says "works with all of them".
const SWAP = ["all your agents", "your terminal", "your browser", "your IDE"] as const;
const SWAP_MS = 2400;

export function Hero() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % SWAP.length), SWAP_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  const word = SWAP[i] ?? SWAP[0];

  const onCta = (e: React.MouseEvent) => {
    const target = document.getElementById("connect");
    if (!target) return;
    const lenis = window.__lenis;
    if (lenis) {
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.6, offset: -80 });
    }
  };

  return (
    <section id="hero" className="relative isolate flex flex-col px-6 pt-28 sm:pt-32">
      <div className="mx-auto flex w-full max-w-[var(--container-wrap)] flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mb-5 font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]"
        >
          user-owned memory · on 0G
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.14, delayChildren: 0.05 }}
          className="font-display text-[clamp(34px,4.6vw,62px)] font-light leading-[1.02] tracking-[-0.02em] text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30, "WONK" 0' }}
        >
          <motion.span variants={lineVariants} className="block">
            One memory
          </motion.span>
          <motion.span variants={lineVariants} className="block">
            for{" "}
            {/* inline-grid with one shared cell: the invisible placeholder sizes it to the
                widest word, and each animating word lands in the SAME cell — so the exiting
                and entering words overlap and crossfade (the line's last word never blanks). */}
            <span
              className="inline-grid align-baseline italic"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-accent)" }}
            >
              <span aria-hidden className="invisible col-start-1 row-start-1">
                all your agents
              </span>
              <AnimatePresence initial={false}>
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 12, filter: "blur(5px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -12, filter: "blur(5px)" }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="col-start-1 row-start-1 inline-block"
                >
                  {word}
                </motion.span>
              </AnimatePresence>
            </span>
            .
          </motion.span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
          className="mt-6 max-w-[52ch] text-[15px] text-[var(--color-ink-2)] sm:text-[16px]"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Works with any kind of agent — your terminal, your browser, your IDE. Save once, recall anywhere;
          encrypted to your wallet on 0G, so you hold the key and can revoke any agent on its own.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
          className="mt-8"
        >
          <a
            href="#connect"
            onClick={onCta}
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-7 py-3.5 text-[15px] font-medium tracking-tight text-[var(--color-cream)] shadow-[var(--shadow-pill)] transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{ border: "none" }}
          >
            <span>Open your memory</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.9, ease: EASE }}
        className="mx-auto mt-12 w-full px-2 pb-4 sm:mt-14"
      >
        <OsScene />
      </motion.div>
    </section>
  );
}
