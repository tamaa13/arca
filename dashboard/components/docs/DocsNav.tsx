"use client";

// Docs sidebar: same-page section links smooth-scroll via Lenis WITHOUT putting a `#` in the URL
// (no glitchy jump). Keeps the href for no-JS / accessibility, but the click is enhanced.
export function DocsNav({ sections }: { sections: { id: string; label: string }[] }) {
  const go = (e: React.MouseEvent, id: string) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const lenis = window.__lenis;
    if (lenis) lenis.scrollTo(el, { offset: -96, duration: 1.1 });
    else el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="hidden lg:block">
      <div className="sticky top-24 flex flex-col gap-1.5 border-l border-[var(--color-border)] pl-4 font-mono-x text-[12px]">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => go(e, s.id)}
            className="text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
