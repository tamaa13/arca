"use client";

import { useEffect, useState } from "react";

type Item = { id: string; label: string };
type Group = { label: string; items: Item[] };

// anima-style docs sidebar: grouped, sticky, with an active-section highlight (scroll-spy).
// Same-page links smooth-scroll via Lenis; preventDefault runs FIRST so a `#` can never reach
// the URL (and there's no jump), even if the target isn't found.
export function DocsSidebar({ groups }: { groups: Group[] }) {
  const [active, setActive] = useState("");
  const idKey = groups.flatMap((g) => g.items.map((i) => i.id)).join(",");

  useEffect(() => {
    const ids = idKey.split(",").filter(Boolean);
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-110px 0px -65% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [idKey]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (typeof window === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    const lenis = window.__lenis;
    if (lenis) lenis.scrollTo(el, { offset: -100, duration: 1.1 });
    else el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-2.5 font-mono-x text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">{g.label}</p>
            <div className="flex flex-col gap-2 border-l border-[var(--color-border)] pl-3.5 font-mono-x text-[12px]">
              {g.items.map((it) => (
                <a
                  key={it.id}
                  href={`#${it.id}`}
                  onClick={(e) => go(e, it.id)}
                  className="transition-colors duration-200"
                  style={{ color: active === it.id ? "var(--color-ink)" : "var(--color-ink-3)" }}
                >
                  {it.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
