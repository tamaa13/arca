// Hero scenario, one machine: open a CLI agent → save a short + a long memory to
// your memory on 0G → minimize → open a browser agent → recall it. Same memory,
// different app, same user. Generic agents (no brand names); only save/recall are
// real agent tools.

export type CliExchange = {
  cmd: string;
  tool: { name: string; args: string; status: string };
};

export const CLI_AGENT = "your agent";

export const CLI_EXCHANGES: CliExchange[] = [
  {
    cmd: "remember: I ship to prod on Fridays only",
    tool: { name: "arca_save_memory", args: '"ships prod Fridays only"', status: "ok · 0.1 KB" },
  },
  {
    cmd: "now save my full deploy runbook — it's long",
    tool: { name: "arca_save_memory", args: "runbook.md · 2.4 KB", status: "ok · encrypted → 0G" },
  },
];

export const CLI_REPLY = "Saved 2 memories — the short note + the runbook, encrypted to your wallet on 0G.";

export type ChatTurn =
  | { role: "user"; text: string }
  | { role: "tool"; text: string }
  | { role: "assistant"; text: string };

export const BROWSER_HOST = "your-agent.app";

export const BROWSER_LINES: ChatTurn[] = [
  { role: "user", text: "what's my full deploy process?" },
  { role: "tool", text: "arca_recall_memory · 2 matches" },
  {
    role: "assistant",
    text: "You ship to prod on **Fridays only**, and your runbook is: tag the release → run migrations → deploy → smoke-test. Recalled from your memory — you saved this earlier in your CLI.",
  },
];
