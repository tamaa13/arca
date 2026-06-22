"use client";

import { useEffect, useState } from "react";
import { RECALL_CYCLE, SAVE_CYCLE } from "@/lib/cycles";
import { TuiCanvas } from "./TuiCanvas";

const LOOP_MS = 11000;
// The recall pane starts only after the save pane has landed its reply
// (~3.9s) — so the two flows read as "saved on the CLI → recalled on the web".
const RECALL_START_MS = 4400;

// Side-by-side comparison of two real flows on ONE vault: a CLI agent saves,
// a web agent recalls. Both remount each loop via the shared `loop` key.
export function HeroCanvas() {
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLoop((n) => n + 1), LOOP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[940px]">
      <div className="grid gap-4 md:grid-cols-2">
        <Pane label="opencode" badge="CLI">
          <TuiCanvas key={`s${loop}`} cycle={SAVE_CYCLE} />
        </Pane>
        <Pane label="ChatGPT" badge="web">
          <TuiCanvas key={`r${loop}`} cycle={RECALL_CYCLE} startDelayMs={RECALL_START_MS} />
        </Pane>
      </div>
      <p className="mt-4 text-center font-mono-x text-[11px] tracking-[0.04em] text-[var(--color-ink-3)]">
        one vault on 0G — saved from your CLI, recalled from a web app. revoke any agent from your dashboard.
      </p>
    </div>
  );
}

function Pane({ label, badge, children }: { label: string; badge: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] shadow-[var(--shadow-doc)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <span className="flex gap-1.5">
          <Dot />
          <Dot />
          <Dot />
        </span>
        <span className="ml-1.5 font-mono-x text-[11px] tracking-[0.04em] text-[var(--color-ink-3)]">{label}</span>
        <span className="ml-auto rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 font-mono-x text-[9px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function Dot() {
  return <span className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]" />;
}
