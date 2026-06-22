"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { CliLine } from "@/lib/scene";

const COLOR_ARCA = "#3a8e5e";
const COLOR_YOU = "#c2683f";
const COLOR_SYS = "var(--color-ink-3)";

const dwell = (l: CliLine) =>
  l.kind === "you" ? 1500 : l.kind === "reply" ? 1500 : l.kind === "tool" ? 750 : 700;

// Reveals a scripted terminal session line-by-line once `play` is true; `you`
// prompts type in. Resets to empty whenever play goes false (scene looped away).
export function CliTerminal({ play, lines, startDelay = 0 }: { play: boolean; lines: CliLine[]; startDelay?: number }) {
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
    <div className="flex h-full flex-col bg-[var(--color-paper)] px-4 py-3 font-mono-x text-[11.5px] leading-[1.5] text-[var(--color-ink)]">
      {lines.slice(0, shown).map((l, i) => (
        <Line key={i} line={l} fresh={i === shown - 1} />
      ))}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span style={{ color: COLOR_YOU }}>{">"}</span>
        <span aria-hidden className="inline-block bg-[var(--color-ink)]" style={{ width: 7, height: 12 }} />
      </div>
    </div>
  );
}

function Line({ line, fresh }: { line: CliLine; fresh: boolean }) {
  if (line.kind === "tool") {
    const ok = line.status.startsWith("ok");
    return (
      <motion.div initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="mt-1.5">
        <div className="flex items-baseline gap-1.5">
          <span>●</span>
          <span>{line.tool}</span>
          {line.args && <span style={{ color: "var(--color-ink-3)" }}>({line.args})</span>}
        </div>
        <div className="pl-[14px]" style={{ color: "var(--color-ink-3)" }}>
          └ <span style={{ color: ok ? COLOR_ARCA : "#c4393a" }}>{line.status}</span>
        </div>
      </motion.div>
    );
  }
  if (line.kind === "reply") {
    return (
      <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-2 grid grid-cols-[48px_1fr] gap-2">
        <span style={{ color: COLOR_ARCA, fontWeight: 500 }}>arca</span>
        <span
          style={{ fontFamily: "var(--font-body)" }}
          dangerouslySetInnerHTML={{ __html: line.text.replace(/\*\*(.*?)\*\*/g, "<strong style='font-weight:600'>$1</strong>") }}
        />
      </motion.div>
    );
  }
  const isSys = line.kind === "sys";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="mt-1.5 grid grid-cols-[48px_1fr] gap-2 first:mt-0">
      <span style={{ color: isSys ? COLOR_SYS : COLOR_YOU, fontWeight: 500 }}>{isSys ? "sys" : "you"}</span>
      <span style={{ color: isSys ? COLOR_SYS : "var(--color-ink)" }}>
        {line.kind === "you" && fresh ? <Typer text={line.text} /> : line.text}
      </span>
    </motion.div>
  );
}

function Typer({ text }: { text: string }) {
  const [s, setS] = useState("");
  useEffect(() => {
    setS("");
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / dur);
      setS(text.slice(0, Math.floor(p * text.length)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setS(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <span>{s}</span>;
}
