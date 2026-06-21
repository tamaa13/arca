// Connector snippets per platform — ported EXACTLY from the legacy dashboard.
import type { Platform } from "./constants";

export function snippets(connectorUrl: string, token: string): Record<Platform, string> {
  const url = connectorUrl;
  const t = token;
  return {
    claude: `# Claude Code — CLI (one command, nothing to install):\nclaude mcp add arca --transport http ${url} --header "Authorization: Bearer ${t}"\n\n# Claude Desktop — claude_desktop_config.json:\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    cursor: `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "arca": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${t}" }\n    }\n  }\n}`,
    chatgpt: `ChatGPT → Settings → Connectors → Add custom connector\n\n  Name   Arca\n  URL    ${url}\n  Auth   Bearer ${t}`,
    other: `Any Streamable-HTTP MCP client:\n\n  URL    ${url}\n  Header Authorization: Bearer ${t}`,
  };
}

export function platformLabel(p: Platform): string {
  return p === "other" ? "Other" : p[0].toUpperCase() + p.slice(1);
}
