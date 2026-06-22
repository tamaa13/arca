"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/atoms/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

// Fixed, full-width nav that morphs into a frosted pill once you scroll past
// the hero fold (anima pattern). Scroll is read via rAF so it stays in sync
// with Lenis's smooth-scroll (which doesn't emit native scroll events).
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setScrolled(window.scrollY > 24);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 sm:pt-4">
      <div
        className={`flex w-full max-w-[var(--container-wrap)] items-center justify-between rounded-full px-3 py-2 transition-all duration-300 sm:px-4 ${
          scrolled
            ? "border border-[var(--color-border)] bg-[rgb(var(--rgb-cream)/0.72)] shadow-[var(--shadow-pill)] backdrop-blur-md"
            : "border border-transparent"
        }`}
      >
        <a href="/" className="flex items-center gap-2.5" style={{ color: "var(--color-ink)" }}>
          <Logo />
          <span className="flex flex-col leading-none">
            <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, letterSpacing: "0.08em" }}>
              ARCA
            </span>
            <span className="mt-1 hidden font-mono-x text-[8px] tracking-[0.22em] text-[var(--color-ink-3)] sm:block">
              WALLET-OWNED MEMORY
            </span>
          </span>
        </a>

        <div className="flex items-center gap-3 sm:gap-4">
          <a href="/docs" className="font-mono-x text-[11px] tracking-[0.06em] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]">
            Docs
          </a>
          <span className="hidden font-mono-x text-[10px] tracking-[0.08em] text-[var(--color-ink-3)] md:inline">
            0G Galileo · testnet
          </span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
