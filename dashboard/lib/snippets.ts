// Connector snippets per platform. Two connect methods:
//  - "signin" (OAuth): add the endpoint URL; the client opens the Arca dashboard and you approve by
//    signing with your wallet. NO token to paste. This is how Claude Code / Claude.ai / ChatGPT connect.
//  - "token" (static bearer): mint a per-agent token and paste it with the URL. For clients that take
//    a header (Cursor, opencode, Codex, Antigravity, raw HTTP MCP).
import type { Platform } from "./constants";

/** Connect method per client. VERIFIED: Claude Code forces OAuth/sign-in (it ignores a static bearer
 *  header), so it (and the web apps) sign in. opencode uses the static bearer header (verified live);
 *  Cursor/Codex/Antigravity/raw take a header too — so they use the token method. */
export const PLATFORM_AUTH: Record<Platform, "signin" | "token"> = {
  claude: "signin",
  claudeweb: "signin",
  chatgpt: "signin",
  cursor: "token",
  opencode: "token",
  codex: "token",
  antigravity: "token",
  other: "token",
};

/** Connections we've actually proven end-to-end on the live server. Everything else works by spec but
 *  is unverified — the panel shows an honesty caption for those so we don't over-claim. */
export const VERIFIED_LIVE: Platform[] = ["claude", "opencode"];

/** Sign-in (OAuth) connect: add the URL, then approve via a wallet sign-in. No token. */
export function signInSnippet(url: string, platform: Platform): string {
  switch (platform) {
    case "claude":
      return `# Claude Code — one command, then sign in to approve:\nclaude mcp add arca --transport http ${url}\n\n# Claude opens the Arca sign-in page — connect your wallet + sign once to approve.\n# No token to paste.`;
    case "claudeweb":
      return `Claude.ai (web) — add Arca as a custom connector (no token):\n\n1. Claude.ai → Settings → Connectors → Add custom connector\n2. Paste this URL:\n   ${url}\n3. Save → Claude.ai opens the Arca sign-in — connect your wallet + sign once to approve.\n\nIt appears in the list below once connected.`;
    case "chatgpt":
      return `ChatGPT (web) — add Arca as a custom connector (no token):\n\n1. ChatGPT → Settings → Connectors  (custom connectors need a paid plan / Developer mode)\n2. Add → paste this URL:\n   ${url}\n3. Save → ChatGPT opens the Arca sign-in — connect your wallet + sign once to approve.\n\nIt appears in the list below once connected.`;
    default:
      return `Add this URL to your client, then sign in at the Arca dashboard to approve:\n  ${url}`;
  }
}

export function snippets(connectorUrl: string, token: string): Record<Platform, string> {
  const url = connectorUrl;
  const t = token;
  return {
    // claude / claudeweb / chatgpt are sign-in clients (see signInSnippet) — these token forms are
    // never shown for them; they only satisfy the Record type.
    claude: `# Claude Code — CLI (one command, nothing to install):\nclaude mcp add arca --transport http ${url} --header "Authorization: Bearer ${t}"\n\n# Claude Desktop — claude_desktop_config.json:\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    claudeweb: `Claude.ai connects via sign-in — no token. (See the steps above.)`,
    chatgpt: `ChatGPT connects via sign-in — no token. (See the steps above.)`,
    cursor: `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    opencode: `// opencode.json (project root) — or ~/.config/opencode/opencode.json\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "arca": {\n      "type": "remote",\n      "url": "${url}",\n      "enabled": true,\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    codex: `# ~/.codex/config.toml  —  native streamable-HTTP (in-flux — if your Codex build lacks it, use the mcp-remote bridge)\n[mcp_servers.arca]\nurl = "${url}"\nbearer_token_env_var = "ARCA_TOKEN"\n\n# then in your shell:\n#   export ARCA_TOKEN="${t}"`,
    antigravity: `// ~/.gemini/config/mcp_config.json  (IDE: Settings → Customizations → Open MCP Config)\n// NOTE: Antigravity uses "serverUrl", NOT "url"\n{\n  "mcpServers": {\n    "arca": {\n      "serverUrl": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    other: `Any Streamable-HTTP MCP client:\n\n  URL    ${url}\n  Header Authorization: Bearer ${t}`,
  };
}

const LABELS: Record<Platform, string> = {
  claude: "Claude Code",
  claudeweb: "Claude.ai",
  chatgpt: "ChatGPT",
  cursor: "Cursor",
  opencode: "OpenCode",
  codex: "Codex",
  antigravity: "Antigravity",
  other: "Other",
};

export function platformLabel(p: Platform): string {
  return LABELS[p];
}
