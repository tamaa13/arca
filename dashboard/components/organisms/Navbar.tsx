"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SoundToggle } from "@/components/sound/SoundToggle";

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
        <Link
          href="/"
          className="flex items-center transition-opacity duration-200 hover:opacity-55"
          style={{ color: "var(--color-ink)" }}
        >
          <span style={{ fontFamily: "var(--font-body)", fontSize: 17, fontWeight: 600, letterSpacing: "0.16em" }}>
            ARCA
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {[
            { href: "/#how", label: "how it works" },
            { href: "/#why", label: "why arca" },
            { href: "/docs", label: "docs" },
          ].map((l) => (
            <NavItem key={l.label} href={l.href} label={l.label} />
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/app"
            className="rounded-full border border-[var(--color-border-strong)] px-3.5 py-1.5 font-mono-x text-[12px] tracking-[0.02em] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)] hover:text-[var(--color-cream)]"
          >
            open app
          </Link>
          <SoundToggle />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

// Center nav item: same-page section links smooth-scroll via Lenis WITHOUT putting a
// `#` in the URL (no glitchy jump); cross-page links fall through to <Link>.
function NavItem({ href, label }: { href: string; label: string }) {
  const onClick = (e: React.MouseEvent) => {
    const hashIdx = href.indexOf("#");
    if (hashIdx === -1 || typeof window === "undefined") return;
    const path = href.slice(0, hashIdx) || "/";
    const id = href.slice(hashIdx + 1);
    const onLanding = window.location.pathname === "/" || window.location.pathname === "/index.html";
    if (path !== "/" || !onLanding) return; // different page → let Link navigate
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const lenis = window.__lenis;
    if (lenis) lenis.scrollTo(el, { offset: -72, duration: 1.2 });
    else el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Link
      href={href}
      onClick={onClick}
      className="font-mono-x text-[12px] tracking-[0.02em] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
    >
      {label}
    </Link>
  );
}
