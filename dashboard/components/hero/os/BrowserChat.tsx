"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ChatTurn } from "@/lib/scene";

// ChatGPT-style palette.
const M = {
  main: "#212121",
  side: "#171717",
  bubble: "#2f2f2f",
  fg: "#ececec",
  dim: "#8e8e8e",
  faint: "#6e6e6e",
  hair: "rgba(255,255,255,0.07)",
  green: "#19c37d",
};

const dwell = (t: ChatTurn) => (t.role === "user" ? 1400 : t.role === "tool" ? 900 : 1800);

export function BrowserChat({ play, lines, startDelay = 0 }: { play: boolean; lines: ChatTurn[]; startDelay?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!play) {
      setShown(0);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = startDelay;
    timers.push(setTimeout(() => setShown(1), t));
    for (let i = 1; i < lines.length; i++) {
      t += dwell(lines[i - 1]);
      const n = i + 1;
      timers.push(setTimeout(() => setShown(n), t));
    }
    return () => timers.forEach(clearTimeout);
  }, [play, lines, startDelay]);

  return (
    <div className="flex h-full text-[13px]" style={{ background: M.main, color: M.fg, fontFamily: "var(--font-body)" }}>
      {/* sidebar */}
      <div className="flex w-[150px] shrink-0 flex-col px-2.5 py-3 text-[11px]" style={{ background: M.side, borderRight: `1px solid ${M.hair}` }}>
        <div className="mb-3 flex items-center justify-between px-1">
          <Mark />
          <Icon path="M9 4 5 8l4 4M9 4v8" />
        </div>
        <Nav active icon={<Icon path="M3 13 13 3l1.5 1.5L4.5 14.5 2 15z" />} label="New chat" />
        <Nav icon={<Icon path="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 15l-3.5-3.5" />} label="Search chats" />
        <Nav icon={<Icon path="M3 4h10M3 8h10M3 12h7" />} label="Library" />
        <Nav icon={<Icon path="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />} label="Projects" />
        <div className="mt-3 mb-0.5 px-1 text-[9px] uppercase tracking-[0.08em]" style={{ color: M.faint }}>
          Recents
        </div>
        <div className="truncate px-1 py-1" style={{ color: "#b4b4b4" }}>deploy process</div>
        <div className="truncate px-1 py-1" style={{ color: M.dim }}>weekly plan</div>
        <div className="mt-auto flex items-center gap-2 px-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold" style={{ background: M.green, color: "#062" }}>U</span>
          <span style={{ color: M.dim, fontSize: 10 }}>You · Free</span>
        </div>
      </div>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5 text-[12px]" style={{ borderBottom: `1px solid ${M.hair}` }}>
          <span>
            agent <span style={{ color: M.dim }}>⌄</span>
          </span>
          <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ border: `1px solid ${M.hair}`, color: M.fg }}>
            Upgrade
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
          {lines.slice(0, shown).map((turn, i) => (
            <Turn key={i} turn={turn} />
          ))}
        </div>

        <div className="shrink-0 px-4 pb-3 pt-1">
          <div className="flex items-center gap-2 rounded-3xl px-4 py-2.5 text-[12px]" style={{ background: M.bubble, color: M.dim }}>
            <span className="text-[16px] leading-none">+</span>
            <span className="flex-1">Ask anything</span>
            <Icon path="M8 2a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V4a2 2 0 0 1 2-2zM4 8a4 4 0 0 0 8 0M8 12v2" />
            <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: M.fg }}>
              <span className="text-[10px]" style={{ color: M.main }}>◼</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  if (turn.role === "tool") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="flex items-center gap-1.5 text-[11px]" style={{ color: M.dim }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: M.green }} />
        Used {turn.text}
      </motion.div>
    );
  }
  if (turn.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-[78%] self-end rounded-3xl px-4 py-2.5 leading-[1.5]"
        style={{ background: M.bubble }}
      >
        {turn.text}
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex gap-2.5 self-start">
      <Mark />
      <div
        className="leading-[1.55]"
        dangerouslySetInnerHTML={{ __html: turn.text.replace(/\*\*(.*?)\*\*/g, "<strong style='font-weight:600'>$1</strong>") }}
      />
    </motion.div>
  );
}

function Nav({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1.5" style={{ background: active ? "rgba(255,255,255,0.06)" : "transparent", color: M.fg }}>
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function Mark() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: M.fg }}>
      <span className="block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: M.main }} />
    </span>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: M.dim, flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}
