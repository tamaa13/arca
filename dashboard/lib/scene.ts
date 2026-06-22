// Hero scenario, one machine: open a CLI agent → save a short + a long memory to
// your vault on 0G → minimize → open a browser agent → recall it. Same vault,
// different app, same user. Only save/recall are real agent tools.

export type CliLine =
  | { kind: "sys"; text: string }
  | { kind: "you"; text: string }
  | { kind: "tool"; tool: string; args?: string; status: string }
  | { kind: "reply"; text: string };

export const CLI_AGENT = "opencode";

export const CLI_LINES: CliLine[] = [
  { kind: "sys", text: "opencode · arca vault on 0G · encrypted to your wallet" },
  { kind: "you", text: "remember: I ship to prod on Fridays only" },
  { kind: "tool", tool: "arca_save_memory", args: '"ships prod Fridays only"', status: "ok · 0.1 KB" },
  { kind: "you", text: "now save my full deploy runbook — it's long" },
  { kind: "tool", tool: "arca_save_memory", args: "runbook.md · 2.4 KB", status: "ok · encrypted → 0G" },
  { kind: "reply", text: "Saved 2 memories to **your vault** — the short note + the runbook, encrypted to your wallet on 0G." },
];

export type ChatTurn =
  | { role: "user"; text: string }
  | { role: "tool"; text: string }
  | { role: "assistant"; text: string };

export const BROWSER_HOST = "chatgpt.com";

export const BROWSER_LINES: ChatTurn[] = [
  { role: "user", text: "what's my full deploy process?" },
  { role: "tool", text: "arca_recall_memory · 2 matches" },
  {
    role: "assistant",
    text: "You ship to prod on **Fridays only**, and your runbook is: tag the release → run migrations → deploy → smoke-test. Recalled from your vault — you saved this earlier in your CLI.",
  },
];
