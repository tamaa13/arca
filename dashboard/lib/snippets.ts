// Connector snippets per platform. Two connect methods:
//  - "signin" (OAuth): add the endpoint URL; the client opens the Arca dashboard and you approve by
//    signing with your wallet. NO token to paste. This is how Claude / Cursor / opencode connect.
//  - "token" (static bearer): mint a per-agent token and paste it with the URL. For clients without
//    a sign-in flow (Codex, raw HTTP MCP).
import type { Platform } from "./constants";

/** Best-known connect method per client. A "signin" client that turns out to lack OAuth can always
 *  fall back to the token method (the panel offers both). Verified: Claude Code uses sign-in (OAuth). */
export const PLATFORM_AUTH: Record<Platform, "signin" | "token"> = {
  claude: "signin",
  cursor: "signin",
  opencode: "signin",
  codex: "token",
  antigravity: "token",
  other: "token",
};

/** Sign-in (OAuth) connect: add the URL, then approve via a wallet sign-in. No token. */
export function signInSnippet(url: string, platform: Platform): string {
  switch (platform) {
    case "claude":
      return `# Claude Code — one command, then sign in to approve:\nclaude mcp add arca --transport http ${url}\n\n# Claude opens the Arca sign-in page — connect your wallet + sign once to approve.\n# No token to paste.`;
    case "cursor":
      return `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "arca": { "url": "${url}" }\n  }\n}\n// Cursor opens the Arca sign-in to approve — connect wallet + sign.`;
    case "opencode":
      return `// opencode.json (project root) — or ~/.config/opencode/opencode.json\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "arca": { "type": "remote", "url": "${url}", "enabled": true }\n  }\n}\n// Sign in at the Arca dashboard to approve.`;
    default:
      return `Add this URL to your client, then sign in at the Arca dashboard to approve:\n  ${url}`;
  }
}

export function snippets(connectorUrl: string, token: string): Record<Platform, string> {
  const url = connectorUrl;
  const t = token;
  return {
    claude: `# Claude Code — CLI (one command, nothing to install):\nclaude mcp add arca --transport http ${url} --header "Authorization: Bearer ${t}"\n\n# Claude Desktop — claude_desktop_config.json:\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    cursor: `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    opencode: `// opencode.json (project root) — or ~/.config/opencode/opencode.json\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "arca": {\n      "type": "remote",\n      "url": "${url}",\n      "enabled": true,\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    codex: `# ~/.codex/config.toml  —  native streamable-HTTP (in-flux — if your Codex build lacks it, use the mcp-remote bridge)\n[mcp_servers.arca]\nurl = "${url}"\nbearer_token_env_var = "ARCA_TOKEN"\n\n# then in your shell:\n#   export ARCA_TOKEN="${t}"`,
    antigravity: `// ~/.gemini/config/mcp_config.json  (IDE: Settings → Customizations → Open MCP Config)\n// NOTE: Antigravity uses "serverUrl", NOT "url"\n{\n  "mcpServers": {\n    "arca": {\n      "serverUrl": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    other: `Any Streamable-HTTP MCP client:\n\n  URL    ${url}\n  Header Authorization: Bearer ${t}`,
  };
}

const LABELS: Record<Platform, string> = {
  claude: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
  codex: "Codex",
  antigravity: "Antigravity",
  other: "Other",
};

export function platformLabel(p: Platform): string {
  return LABELS[p];
}
