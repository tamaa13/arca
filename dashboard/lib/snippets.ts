// Connector snippets per platform. Two connect methods:
//  - "signin" (OAuth): add the endpoint URL; the client opens the Arca dashboard and you approve by
//    signing with your wallet. NO token to paste. This is how Claude / Cursor / opencode connect.
//  - "token" (static bearer): mint a per-agent token and paste it with the URL. For clients without
//    a sign-in flow (Codex, raw HTTP MCP).
import type { Platform } from "./constants";

/** Connect method per client. VERIFIED: Claude Code forces OAuth/sign-in (it ignores a static bearer
 *  header), so it's the only "signin" client. opencode uses the static bearer header (verified live),
 *  and Cursor/Codex/Antigravity/raw clients take a header too — so they use the token method. (A
 *  "signin" client that lacks OAuth, or a token client that prefers OAuth, can use the other method.) */
export const PLATFORM_AUTH: Record<Platform, "signin" | "token"> = {
  claude: "signin",
  cursor: "token",
  opencode: "token",
  codex: "token",
  antigravity: "token",
  web: "signin",
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
    case "web":
      return `ChatGPT & Claude.ai web — add Arca as a custom connector (no token):\n\n1. Open connector settings:\n   • ChatGPT → Settings → Connectors → Add  (or "Create" / "Add custom connector")\n   • Claude.ai → Settings → Connectors → Add custom connector\n2. Paste this URL as the MCP server / connector URL:\n   ${url}\n3. Save. The client opens the Arca sign-in — connect your wallet + sign once to approve.\n\nNo token to paste. It appears in the list below once connected.`;
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
    // web is a sign-in client (see signInSnippet) — this token form is never shown for it.
    web: `Web (Claude.ai / ChatGPT) connects via sign-in — pick the ChatGPT / Web tab.`,
    other: `Any Streamable-HTTP MCP client:\n\n  URL    ${url}\n  Header Authorization: Bearer ${t}`,
  };
}

const LABELS: Record<Platform, string> = {
  claude: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
  codex: "Codex",
  antigravity: "Antigravity",
  web: "ChatGPT / Web",
  other: "Other",
};

export function platformLabel(p: Platform): string {
  return LABELS[p];
}
