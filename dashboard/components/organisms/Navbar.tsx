"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/atoms/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

// Arca's own navbar — a clean full-width bar that gains a hairline + frosted base
// once you scroll. (Not anima's floating center pill; anima is reference only.)
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setScrolled(window.scrollY > 8);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-[var(--color-border)] backdrop-blur-md" : "border-b border-transparent"
      }`}
      style={{ background: scrolled ? "rgb(var(--rgb-cream) / 0.78)" : "transparent" }}
    >
      <div className="mx-auto flex h-14 w-full max-w-[var(--container-wrap)] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" style={{ color: "var(--color-ink)" }}>
          <Logo />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, letterSpacing: "0.14em" }}>
            ARCA
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {[
            { href: "/#how", label: "how it works" },
            { href: "/#why", label: "why arca" },
            { href: "/docs", label: "docs" },
          ].map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="font-mono-x text-[12px] tracking-[0.02em] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/app"
            className="rounded-full border border-[var(--color-border-strong)] px-3.5 py-1.5 font-mono-x text-[12px] tracking-[0.02em] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)] hover:text-[var(--color-cream)]"
          >
            open app
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
