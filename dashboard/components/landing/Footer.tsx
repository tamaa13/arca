"use client";

import Link from "next/link";
import { useConsent } from "@/components/consent/ConsentProvider";
import { zeroG } from "@/components/atoms/ZeroG";

export function Footer() {
  const { openSettings } = useConsent();
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-[var(--container-wrap)] flex-col gap-2 px-6 py-10 font-mono-x text-[11px] text-[var(--color-ink-3)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <span>{zeroG("arca · user-owned memory on 0G")}</span>
      <span className="flex items-center gap-5">
        <Link href="/app" className="transition-colors hover:text-[var(--color-ink)]">app</Link>
        <Link href="/docs" className="transition-colors hover:text-[var(--color-ink)]">docs</Link>
        <button
          onClick={openSettings}
          className="transition-colors hover:text-[var(--color-ink)]"
          style={{ background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", letterSpacing: "inherit" }}
        >
          cookie settings
        </button>
        <a href="https://github.com/tamaa13/arca" target="_blank" rel="noreferrer" className="transition-colors hover:text-[var(--color-ink)]">
          github
        </a>
        <a href="https://github.com/tamaa13/arca/blob/main/LICENSE" target="_blank" rel="noreferrer" className="transition-colors hover:text-[var(--color-ink)]">
          MIT
        </a>
      </span>
    </footer>
  );
}
