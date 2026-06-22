"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { CliExchange } from "@/lib/scene";
import { ClaudeLogo } from "./logos";

// Claude-Code-style palette: dark navy, warm-white text, accent prompt/cursor.
const C = {
  bg: "#0d1117",
  fg: "#e6e3db",
  dim: "#6e7681",
  green: "#6cc98f",
  cyan: "#56b6c2",
  magenta: "#c578dd",
  amber: "#d6a772",
  hair: "rgba(230,227,219,0.08)",
  inputBg: "#0f151d",
  inputBorder: "#222b36",
};

const TYPE_MS = 1300;
const THINK_MS = 850;
const GAP_MS = 600;

type Item =
  | { kind: "cmd"; text: string }
  | { kind: "tool"; name: string; args: string; status: string }
  | { kind: "reply"; text: string };

export function CliTerminal({
  play,
  exchanges,
  reply,
  startDelay = 0,
}: {
  play: boolean;
  exchanges: CliExchange[];
  reply: string;
  startDelay?: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    setItems([]);
    setTyping(null);
    setThinking(false);
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = startDelay;
    exchanges.forEach((ex) => {
      timers.push(setTimeout(() => setTyping(ex.cmd), t));
      t += TYPE_MS;
      timers.push(
        setTimeout(() => {
          setItems((p) => [...p, { kind: "cmd", text: ex.cmd }]);
          setTyping(null);
          setThinking(true);
        }, t),
      );
      t += THINK_MS;
      timers.push(
        setTimeout(() => {
          setThinking(false);
          setItems((p) => [...p, { kind: "tool", name: ex.tool.name, args: ex.tool.args, status: ex.tool.status }]);
        }, t),
      );
      t += GAP_MS;
    });
    timers.push(setTimeout(() => setItems((p) => [...p, { kind: "reply", text: reply }]), t));
    return () => timers.forEach(clearTimeout);
  }, [play, exchanges, reply, startDelay]);

  return (
    <div className="flex h-full flex-col font-mono-x text-[11.5px] leading-[1.6]" style={{ background: C.bg, color: C.fg }}>
      {/* header block (Claude-Code style: name / connection / cwd) */}
      <div className="shrink-0 px-4 pt-3">
        <div className="flex items-center gap-2">
          <ClaudeLogo size={15} />
          <span style={{ fontWeight: 600, color: C.fg }}>Claude Code</span>
          <span style={{ color: C.dim }}>· arca memory</span>
        </div>
        <div style={{ color: C.dim }}>connected to arca · 0G mainnet · encrypted to your wallet</div>
        <div style={{ color: C.dim }}>~/project</div>
      </div>

      {/* conversation */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 pt-2.5">
        {items.map((it, i) => (
          <Row key={i} item={it} />
        ))}
        {thinking && <Thinking />}
      </div>

      {/* input box */}
      <div className="mx-3 mb-2 shrink-0 rounded-md px-3 py-2" style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}` }}>
        <span style={{ color: C.dim }}>{">"}</span> {typing ? <Typer text={typing} /> : null}
        <BlinkCursor />
      </div>

      {/* status lines */}
      <div className="shrink-0 px-4 pb-2 text-[10px]">
        <div>
          <span style={{ color: C.magenta }}>11:43</span> <span style={{ color: C.cyan }}>~/project</span>{" "}
          <span style={{ color: C.dim }}>arca · 0xf4…cac</span>
        </div>
        <div>
          <span style={{ color: C.amber }}>⏵⏵ memory: on</span> <span style={{ color: C.dim }}>· ↵ to send</span>
        </div>
      </div>
    </div>
  );
}

function Row({ item }: { item: Item }) {
  if (item.kind === "cmd") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="mt-1.5">
        <span style={{ color: C.dim }}>{">"}</span> {item.text}
      </motion.div>
    );
  }
  if (item.kind === "tool") {
    const ok = item.status.startsWith("ok");
    return (
      <motion.div initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="mt-1">
        <div className="flex items-baseline gap-1.5">
          <span style={{ color: C.fg }}>●</span>
          <span style={{ color: C.fg }}>{item.name}</span>
          <span style={{ color: C.dim }}>({item.args})</span>
        </div>
        <div style={{ color: C.dim }}>
          {"  ⎿  "}
          <span style={{ color: ok ? C.green : "#d87a6a" }}>{item.status}</span>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-2"
      style={{ color: C.fg }}
      dangerouslySetInnerHTML={{ __html: item.text.replace(/\*\*(.*?)\*\*/g, "<strong style='font-weight:600;color:#fff'>$1</strong>") }}
    />
  );
}

const STAR = ["✻", "✶", "✷", "✸", "✹", "✺"];

function Thinking() {
  const [f, setF] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setF((x) => (x + 1) % STAR.length), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-1.5" style={{ color: C.amber }}>
      {STAR[f]} working… <span style={{ color: C.dim }}>(esc to interrupt)</span>
    </div>
  );
}

function Typer({ text }: { text: string }) {
  const [s, setS] = useState("");
  useEffect(() => {
    setS("");
    let raf = 0;
    const start = performance.now();
    const dur = TYPE_MS - 150;
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

function BlinkCursor() {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block align-text-bottom"
      style={{ width: 7, height: 13, background: C.green }}
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ repeat: Infinity, duration: 1, times: [0, 0.5, 0.5, 1], ease: "linear" }}
    />
  );
}
