"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EASE } from "@/lib/motion";
import { BROWSER_HOST, BROWSER_LINES, CLI_AGENT, CLI_LINES } from "@/lib/scene";
import { BrowserChat } from "./BrowserChat";
import { CliTerminal } from "./CliTerminal";

const MINIMIZE_AT = 7000; // CLI finishes both saves, then minimizes
const LOOP_MS = 14000;

// One machine, two apps: the CLI saves to your vault, then minimizes and a
// browser agent recalls the same memory. A self-scheduling phase loop drives
// the window choreography; the players reset via their `play` prop.
export function OsScene() {
  const [phase, setPhase] = useState<"cli" | "browser">("cli");

  useEffect(() => {
    let mounted = true;
    let tMin: ReturnType<typeof setTimeout>;
    let tLoop: ReturnType<typeof setTimeout>;
    const run = () => {
      setPhase("cli");
      tMin = setTimeout(() => mounted && setPhase("browser"), MINIMIZE_AT);
      tLoop = setTimeout(() => mounted && run(), LOOP_MS);
    };
    run();
    return () => {
      mounted = false;
      clearTimeout(tMin);
      clearTimeout(tLoop);
    };
  }, []);

  const onCli = phase === "cli";

  return (
    <div
      className="relative mx-auto aspect-[16/10] w-full max-w-[960px] overflow-hidden rounded-[18px] border border-[var(--color-border)] shadow-[var(--shadow-doc)]"
      style={{ background: "linear-gradient(160deg, var(--color-cream-warm), var(--color-cream-deep))" }}
    >
      {/* menubar */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-1.5 font-mono-x text-[10px] tracking-[0.06em] text-[var(--color-ink-3)] backdrop-blur-sm"
        style={{ background: "rgb(var(--rgb-cream) / 0.5)" }}
      >
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />
          arca — one vault, every agent
        </span>
        <span className="hidden sm:inline">0G · testnet</span>
      </div>

      {/* desktop */}
      <div className="absolute inset-0 flex items-center justify-center px-6 pt-9 pb-14 sm:px-8">
        {/* CLI window */}
        <motion.div
          className="absolute h-[74%] w-[70%] overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-paper)] shadow-[var(--shadow-card)]"
          animate={onCli ? { scale: 1, opacity: 1, x: 0, y: 0 } : { scale: 0.16, opacity: 0, x: -210, y: 150 }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ zIndex: onCli ? 20 : 10 }}
        >
          <WindowBar title={`${CLI_AGENT} — zsh`} kind="terminal" />
          <div className="h-[calc(100%-34px)] overflow-hidden">
            <CliTerminal play={onCli} lines={CLI_LINES} />
          </div>
        </motion.div>

        {/* Browser window */}
        <motion.div
          className="absolute h-[82%] w-[76%] overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-cream)] shadow-[var(--shadow-card)]"
          initial={false}
          animate={!onCli ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.96, opacity: 0, y: 28 }}
          transition={{ duration: 0.55, ease: EASE, delay: !onCli ? 0.2 : 0 }}
          style={{ zIndex: !onCli ? 20 : 5 }}
        >
          <WindowBar title={BROWSER_HOST} kind="browser" />
          <div className="h-[calc(100%-34px)] overflow-hidden">
            <BrowserChat play={!onCli} lines={BROWSER_LINES} startDelay={450} />
          </div>
        </motion.div>
      </div>

      {/* dock */}
      <div className="absolute inset-x-0 bottom-2 z-30 flex justify-center">
        <div
          className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] px-2.5 py-1.5 backdrop-blur-md"
          style={{ background: "rgb(var(--rgb-cream) / 0.6)" }}
        >
          <DockIcon active={onCli} kind="terminal" />
          <DockIcon active={!onCli} kind="browser" />
        </div>
      </div>
    </div>
  );
}

function WindowBar({ title, kind }: { title: string; kind: "terminal" | "browser" }) {
  return (
    <div
      className="flex h-[34px] items-center gap-2 border-b border-[var(--color-border)] px-3"
      style={{ background: "color-mix(in oklab, var(--color-ink) 3%, transparent)" }}
    >
      <span className="flex gap-1.5">
        <Dot />
        <Dot />
        <Dot />
      </span>
      {kind === "browser" ? (
        <span className="ml-2 flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--color-paper)] px-2.5 py-0.5 text-center font-mono-x text-[10px] text-[var(--color-ink-3)]">
          {title}
        </span>
      ) : (
        <span className="ml-2 font-mono-x text-[10.5px] text-[var(--color-ink-3)]">{title}</span>
      )}
    </div>
  );
}

function Dot() {
  return <span className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]" />;
}

function DockIcon({ active, kind }: { active: boolean; kind: "terminal" | "browser" }) {
  return (
    <div
      className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] transition-colors"
      style={{ background: active ? "var(--color-ink)" : "var(--color-paper)" }}
    >
      <span className="font-mono-x text-[12px]" style={{ color: active ? "var(--color-cream)" : "var(--color-ink-3)" }}>
        {kind === "terminal" ? ">_" : "◐"}
      </span>
      {active && <span className="absolute -bottom-1 h-1 w-1 rounded-full" style={{ background: "var(--color-accent)" }} />}
    </div>
  );
}
