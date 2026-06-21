// Connector snippets per platform — every client needs the SAME two things:
// the URL (connectorUrl) + an `Authorization: Bearer <token>` header. Only the format differs.
import type { Platform } from "./constants";

export function snippets(connectorUrl: string, token: string): Record<Platform, string> {
  const url = connectorUrl;
  const t = token;
  return {
    claude: `# Claude Code — CLI (one command, nothing to install):\nclaude mcp add arca --transport http ${url} --header "Authorization: Bearer ${t}"\n\n# Claude Desktop — claude_desktop_config.json:\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    cursor: `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    opencode: `// opencode.json (project root) — or ~/.config/opencode/opencode.json\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "arca": {\n      "type": "remote",\n      "url": "${url}",\n      "enabled": true,\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    codex: `# ~/.codex/config.toml  —  native streamable-HTTP (in-flux — if your Codex build lacks it, use the mcp-remote bridge)\n[mcp_servers.arca]\nurl = "${url}"\nbearer_token_env_var = "ARCA_TOKEN"\n\n# then in your shell:\n#   export ARCA_TOKEN="${t}"`,
    antigravity: `// ~/.gemini/config/mcp_config.json  (IDE: Settings → Customizations → Open MCP Config)\n// NOTE: Antigravity uses "serverUrl", NOT "url"\n{\n  "mcpServers": {\n    "arca": {\n      "serverUrl": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    web: `Claude.ai web & ChatGPT web — add Arca as a custom connector (OAuth).\n\n1. In the client's "Add custom connector" dialog, paste the URL:\n     ${url}\n2. The client discovers Arca's OAuth server and opens the Arca consent page.\n3. Connect your wallet + sign once to approve — you're redirected back, connected.\n\nNo Bearer token to paste: web clients use OAuth (PKCE). The client never gets your\nkey — Arca derives it from your signature (never your private key). Same vault as\nevery other client (Claude Code · Cursor · OpenCode · Codex · Antigravity).`,
    other: `Any Streamable-HTTP MCP client:\n\n  URL    ${url}\n  Header Authorization: Bearer ${t}`,
  };
}

const LABELS: Record<Platform, string> = {
  claude: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
  codex: "Codex",
  antigravity: "Antigravity",
  web: "Web (OAuth)",
  other: "Other",
};

export function platformLabel(p: Platform): string {
  return LABELS[p];
}
