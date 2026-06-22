// The hero terminal's looping story — Arca's pitch in three acts:
// (1) one agent saves a memory → encrypted to your wallet on 0G,
// (2) a DIFFERENT agent recalls it → one vault, every agent,
// (3) you revoke one agent → the rest keep working.
export type ToolStreamEntry = { tool: string; args?: string; status: string };
export type Cycle = {
  id: string;
  agent: string; // the calling agent shown in the `you`-style label
  agentColor: string;
  prompt: string;
  toolStream: ToolStreamEntry[];
  reply: string;
};

export const CYCLES: Cycle[] = [
  {
    id: "save",
    agent: "claude",
    agentColor: "#c2683f",
    prompt: "remember: I ship to prod on Fridays only",
    toolStream: [
      { tool: "save_memory", args: '"ships prod Fridays only"', status: "ok" },
      { tool: "anchor.0g", args: "encrypted → 0xf4…cac", status: "ok" },
    ],
    reply:
      "Saved. Encrypted to **your wallet** and stored on 0G — no operator can read it, and every agent you connect shares it.",
  },
  {
    id: "recall",
    agent: "opencode",
    agentColor: "#2f8f7a",
    prompt: "what days do I deploy?",
    toolStream: [{ tool: "recall_memory", args: '"deploy days"', status: "ok" }],
    reply: "You ship to prod on **Fridays only** — saved earlier from Claude. One vault, every agent.",
  },
  {
    id: "revoke",
    agent: "you",
    agentColor: "#2a78a8",
    prompt: "/revoke codex-laptop",
    toolStream: [{ tool: "revoke_connector", args: '"codex-laptop"', status: "ok" }],
    reply: "Codex is cut off instantly. Claude and opencode still work — **revoke one, keep the rest.**",
  },
];
