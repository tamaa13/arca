"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ChatTurn } from "@/lib/scene";

const dwell = (t: ChatTurn) => (t.role === "user" ? 1400 : t.role === "tool" ? 800 : 1700);

// A minimal web-agent chat (generic, no brand) that reveals turns once `play` is true.
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
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-[var(--color-cream)] px-5 py-5 text-[13px]" style={{ fontFamily: "var(--font-body)" }}>
      {lines.slice(0, shown).map((turn, i) => (
        <Bubble key={i} turn={turn} />
      ))}
    </div>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "tool") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 self-start rounded-full border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-1 font-mono-x text-[10.5px] text-[var(--color-ink-3)]"
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3a8e5e" }} />
        {turn.text}
      </motion.div>
    );
  }
  const isUser = turn.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`max-w-[82%] rounded-2xl px-4 py-2.5 leading-[1.5] ${
        isUser
          ? "self-end bg-[var(--color-ink)] text-[var(--color-cream)]"
          : "self-start border border-[var(--color-border)] bg-[var(--color-paper)] text-[var(--color-ink)]"
      }`}
      dangerouslySetInnerHTML={{ __html: turn.text.replace(/\*\*(.*?)\*\*/g, "<strong style='font-weight:600'>$1</strong>") }}
    />
  );
}
