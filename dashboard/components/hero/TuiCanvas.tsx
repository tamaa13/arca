"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Cycle, ToolStreamEntry } from "@/lib/cycles";

type Stage = "idle" | "typing" | "committed" | "tools" | "reply";

const IDLE_MS = 400;
const TYPING_MS = 2000;
const COMMIT_MS = 200;
const TOOL_STAGGER_MS = 700;
const REPLY_DELAY_MS = 600;

const COLOR_SYS = "var(--color-ink-3)";
const COLOR_ARCA = "#3a8e5e";

// Adapted from anima's hero TUI: a from-scratch monospace terminal driven by a
// small stage machine (typing → tools stream → reply), themed to Arca.
export function TuiCanvas({ cycle, startDelayMs = 0 }: { cycle: Cycle; startDelayMs?: number }) {
  const [stage, setStage] = useState<Stage>("idle");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // startDelayMs lets the RIGHT (recall) pane wait until the LEFT (save) pane
    // has finished, so the comparison reads "saved here → recalled there".
    const d = startDelayMs;
    setStage("idle");
    const tTyping = setTimeout(() => setStage("typing"), d + IDLE_MS);
    const tCommitted = setTimeout(() => setStage("committed"), d + IDLE_MS + TYPING_MS);
    const tTools = setTimeout(() => setStage("tools"), d + IDLE_MS + TYPING_MS + COMMIT_MS);
    const replyAt =
      d + IDLE_MS + TYPING_MS + COMMIT_MS + cycle.toolStream.length * TOOL_STAGGER_MS + REPLY_DELAY_MS;
    const tReply = setTimeout(() => setStage("reply"), replyAt);
    return () => {
      clearTimeout(tTyping);
      clearTimeout(tCommitted);
      clearTimeout(tTools);
      clearTimeout(tReply);
    };
  }, [cycle.id, cycle.toolStream.length, startDelayMs]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [stage]);

  const showUserPrompt = stage === "committed" || stage === "tools" || stage === "reply";
  const showAnimaRow = stage === "tools" || stage === "reply";
  const showTools = stage === "tools" || stage === "reply";
  const showReply = stage === "reply";
  const showThinking = stage === "committed" || stage === "tools";

  return (
    <div className="flex h-full min-h-[300px] flex-col font-mono-x text-[12px] leading-[1.55] text-[var(--color-ink)]">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Row label="sys" labelColor={COLOR_SYS}>
          <span style={{ color: COLOR_SYS }}>arca vault · 0G testnet · encrypted to your wallet</span>
        </Row>

        {showUserPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="mt-3">
            <Row label={cycle.agent} labelColor={cycle.agentColor}>
              <span style={{ whiteSpace: "pre-wrap" }}>{cycle.prompt}</span>
            </Row>
          </motion.div>
        )}

        {showAnimaRow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="mt-3">
            <Row label="arca" labelColor={COLOR_ARCA}>
              <div className="flex flex-col">
                {showTools &&
                  cycle.toolStream.map((entry, idx) => (
                    <ToolBlock key={`${cycle.id}-${entry.tool}-${idx}`} entry={entry} delaySec={(idx * TOOL_STAGGER_MS) / 1000} />
                  ))}
                {showReply && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32 }}
                    className="mt-3 text-[12.5px] leading-[1.5]"
                    style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-body)" }}
                    dangerouslySetInnerHTML={{
                      __html: cycle.reply.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:600">$1</strong>'),
                    }}
                  />
                )}
              </div>
            </Row>
          </motion.div>
        )}
      </div>

      {showThinking && <ThinkingRow stage={stage} color={cycle.agentColor} />}

      <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-2.5" style={{ background: "color-mix(in oklab, var(--color-ink) 4%, transparent)" }}>
        <div className="flex items-center gap-1.5">
          <span style={{ color: cycle.agentColor }}>{">"}</span>
          <span className="min-w-0 flex-1" style={{ wordBreak: "break-word" }}>
            {stage === "typing" ? <TypingChars text={cycle.prompt} durationMs={TYPING_MS} /> : null}
            <span aria-hidden className="inline-block align-text-bottom bg-[var(--color-ink)]" style={{ width: 7, height: 13, marginLeft: 1 }} />
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-4 py-1.5 text-[10px] tracking-[0.04em]">
        <span className="flex items-center gap-2">
          <span style={{ color: COLOR_ARCA, fontWeight: 500 }}>arca</span>
          <span style={{ color: "var(--color-ink-3)", opacity: 0.5 }}>·</span>
          <span style={{ color: "var(--color-ink-3)" }}>vault 0xf4…cac</span>
          <span style={{ color: "var(--color-ink-3)", opacity: 0.5 }}>·</span>
          <span style={{ color: "var(--color-ink-3)" }}>0G testnet</span>
        </span>
        <span style={{ color: "var(--color-accent)" }}>you hold the key</span>
      </div>
    </div>
  );
}

function Row({ label, labelColor, children }: { label: string; labelColor: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-start gap-2">
      <span style={{ color: labelColor, fontWeight: 500 }} className="pt-[1px] tracking-tight">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ToolBlock({ entry, delaySec }: { entry: ToolStreamEntry; delaySec: number }) {
  const ok = entry.status.startsWith("ok");
  return (
    <motion.div initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: delaySec }} className="mt-1.5 first:mt-0">
      <div className="flex items-baseline gap-1.5">
        <span style={{ color: "var(--color-ink)" }}>●</span>
        <span style={{ color: "var(--color-ink)" }}>{entry.tool}</span>
        {entry.args && <span style={{ color: "var(--color-ink-3)" }}>({entry.args})</span>}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: delaySec + 0.12 }} className="pl-[14px]" style={{ color: "var(--color-ink-3)" }}>
        └ <span style={{ color: ok ? COLOR_ARCA : "#c4393a" }}>{entry.status}</span>
      </motion.div>
    </motion.div>
  );
}

function ThinkingRow({ stage, color }: { stage: Stage; color: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);
  return (
    <div className="shrink-0 px-4 py-1.5">
      <div className="flex items-center gap-2">
        <Spinner color={color} />
        <span className="text-[12px]" style={{ color }}>
          working… {seconds}s
        </span>
      </div>
    </div>
  );
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

function Spinner({ color }: { color: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono-x text-[12px]" style={{ color }}>
      {SPINNER_FRAMES[frame]}
    </span>
  );
}

function TypingChars({ text, durationMs }: { text: string; durationMs: number }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - start) / durationMs);
      setShown(text.slice(0, Math.floor(progress * text.length)));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setShown(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, durationMs]);
  return <span>{shown}</span>;
}
