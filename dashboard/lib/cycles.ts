// The hero compares TWO flows side by side to prove one vault, any platform:
//   LEFT  — a CLI agent SAVES a memory  → encrypted to your wallet on 0G.
//   RIGHT — a different agent on the WEB recalls that SAME memory.
// Only save/recall are real MCP tools agents call. Revoke is a DASHBOARD action
// (session-bearer / wallet sig), not an agent tool — so it's not shown here.
export type ToolStreamEntry = { tool: string; args?: string; status: string };
export type Cycle = {
  id: string;
  agent: string; // shown in the prompt label
  agentColor: string;
  prompt: string;
  toolStream: ToolStreamEntry[];
  reply: string;
};

export const SAVE_CYCLE: Cycle = {
  id: "save",
  agent: "opencode",
  agentColor: "#c2683f",
  prompt: "remember: I ship to prod on Fridays only",
  toolStream: [
    { tool: "arca_save_memory", args: '"ships prod Fridays only"', status: "ok · encrypted → 0xf4…cac on 0G" },
  ],
  reply: "Saved to **your vault** — encrypted to your wallet, stored on 0G. No operator can read it.",
};

export const RECALL_CYCLE: Cycle = {
  id: "recall",
  agent: "chatgpt",
  agentColor: "#2a78a8",
  prompt: "what days do I deploy?",
  toolStream: [{ tool: "arca_recall_memory", args: '"deploy days"', status: "ok · 1 match" }],
  reply: "You ship to prod on **Fridays only** — saved earlier from your CLI. Same vault, any agent.",
};
