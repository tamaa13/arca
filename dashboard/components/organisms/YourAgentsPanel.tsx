"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/atoms/CodeBlock";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { KeyValue } from "@/components/atoms/KeyValue";
import { ConnectorTabs } from "@/components/molecules/ConnectorTabs";
import { snippets } from "@/lib/snippets";
import type { Platform } from "@/lib/constants";
import type { ArcaApi } from "@/hooks/useArca";
import type { ConnectorListing } from "@/lib/connectors";

const fmtDate = (unixS: number) =>
  new Date(unixS * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function statusOf(c: ConnectorListing): { text: string; color?: string } {
  if (c.revoked) return { text: "Revoked", color: "var(--muted)" };
  if (c.expiresAt !== 0 && Date.now() / 1000 > c.expiresAt) return { text: "Expired", color: "var(--muted)" };
  return { text: "Active", color: "var(--ok)" };
}

// The SINGLE place to connect + manage agents. Pick your CLI platform, name the agent, and get a
// paste-ready config carrying that agent's OWN revocable token — so a compromised agent can be
// revoked alone. Web apps (Claude.ai / ChatGPT) connect via OAuth (see the note) and appear in the
// list too. CLI tabs only: web has no token to paste, so it isn't a tab.
export function YourAgentsPanel({ arca }: { arca: ArcaApi }) {
  const [platform, setPlatform] = useState<Platform>("claude");
  const [label, setLabel] = useState("");
  const d = arca.session;
  if (!d?.token) return null;

  const ready = arca.step3Done && arca.step4Done; // funded AND authorized = saves will work
  const list = arca.connectors ?? [];
  // After a successful mint, render the SELECTED platform's snippet carrying the new token. The
  // token is platform-agnostic — switching tabs just reformats the same token for that client.
  const snippet = arca.newConnectorToken ? snippets(d.connectorUrl, arca.newConnectorToken)[platform] : null;

  const onAdd = async () => {
    await arca.mintConnector(label);
    setLabel("");
  };
  const onRevoke = (c: ConnectorListing) => {
    if (window.confirm(`Revoke "${c.label}"? This agent loses access to your vault immediately.`)) {
      void arca.revokeConnector(c.id);
    }
  };

  return (
    <section className="step on" style={{ marginBottom: 18 }}>
      <h2>Your agents</h2>
      <p>
        Connect any agent to your one vault. Each gets its own revocable token — if one is
        compromised, revoke just that one; the rest keep working.
      </p>

      {!ready && (
        <p className="note" style={{ color: "var(--accent)", marginTop: 14 }}>
          ⚠ Activate your vault first (step above). You can add agents now, but they can&apos;t save
          until your vault is funded + authorized.
        </p>
      )}

      <KeyValue label="Endpoint" value={d.connectorUrl} style={{ marginTop: 14 }} />
      <ConnectorTabs active={platform} onSelect={setPlatform} />

      <p className="note" style={{ marginTop: 10 }}>
        Name this agent and add it — you get a ready-to-paste config with its own token. Nothing to
        install (it&apos;s a remote MCP).
      </p>
      <div className="row">
        <Input
          type="text"
          placeholder="e.g. Codex-laptop"
          value={label}
          maxLength={64}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !arca.connectorBusy) void onAdd(); }}
          disabled={arca.connectorBusy}
          style={{ width: 200 }}
        />
        <Button onClick={onAdd} disabled={arca.connectorBusy || !label.trim()}>
          {arca.connectorBusy ? "…" : "Add agent"}
        </Button>
      </div>
      {snippet && (
        <div style={{ marginTop: 12 }}>
          <p className="note" style={{ color: "var(--accent)", marginTop: 0 }}>
            ⚠ Copy this now — the token is shown only once and cannot be recovered.
          </p>
          <CodeBlock code={snippet} copyable />
          <div className="row">
            <Button variant="ghost" onClick={arca.dismissNewToken}>
              Done — I&apos;ve copied it
            </Button>
          </div>
        </div>
      )}

      <p className="note" style={{ marginTop: 14 }}>
        Using a web app (Claude.ai / ChatGPT)? Add the endpoint above as a custom connector and sign
        once — it appears in the list below automatically, revocable like any other.
      </p>

      {/* connected agents list */}
      {arca.connectors == null ? (
        <p className="note" style={{ marginTop: 16 }}>loading…</p>
      ) : list.length === 0 ? (
        <p className="note" style={{ marginTop: 16 }}>
          No agents connected yet — add one above, or connect a web app (it appears here automatically).
        </p>
      ) : (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 4 }}>
          {list.map((c) => {
            const st = statusOf(c);
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--line)",
                  opacity: c.revoked ? 0.55 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 14, wordBreak: "break-word" }}>{c.label}</span>
                    <span
                      className="mono"
                      style={{ fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", border: "1px solid var(--line-strong)", padding: "1px 5px" }}
                    >
                      {c.kind === "oauth" ? "Web" : "CLI"}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                    added {fmtDate(c.createdAt)} · <span style={{ color: st.color }}>{st.text}</span>
                  </div>
                </div>
                {!c.revoked && (
                  <Button
                    variant="ghost"
                    onClick={() => onRevoke(c)}
                    disabled={arca.connectorBusy}
                    style={{ padding: "8px 14px", fontSize: 12, flexShrink: 0 }}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {arca.connectorStatus.text && (
        <div className={`status ${arca.connectorStatus.kind}`}>{arca.connectorStatus.text}</div>
      )}

      <p style={{ marginTop: 14 }}>
        Your memory is recoverable directly from 0G with your wallet, even without Arca.
      </p>
    </section>
  );
}
