"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/atoms/CodeBlock";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import type { ArcaApi } from "@/hooks/useArca";
import type { ConnectorListing } from "@/lib/connectors";

const fmtDate = (unixS: number) =>
  new Date(unixS * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function statusOf(c: ConnectorListing): { text: string; color?: string } {
  if (c.revoked) return { text: "Revoked", color: "var(--muted)" };
  if (c.expiresAt !== 0 && Date.now() / 1000 > c.expiresAt) return { text: "Expired", color: "var(--muted)" };
  return { text: "Active", color: "var(--ok)" };
}

// Connected agents: each agent (CLI device or web app) holds its OWN revocable token. If one
// is compromised — say a hacked Codex — revoke just that one; every other agent keeps working.
// Web apps (Claude.ai / ChatGPT) appear here automatically after they connect via OAuth.
export function ConnectedAgentsPanel({ arca }: { arca: ArcaApi }) {
  const [label, setLabel] = useState("");
  if (!arca.session?.token) return null;

  const list = arca.connectors ?? [];
  const active = list.filter((c) => !c.revoked);

  const onAdd = async () => {
    await arca.mintConnector(label);
    setLabel("");
  };

  return (
    <section className="step on" style={{ marginBottom: 18 }}>
      <h2>Connected agents</h2>
      <p>
        Each agent gets its own revocable token. If one is compromised, revoke just that one —
        the rest keep working. Web apps appear here automatically after they connect.
      </p>

      {/* the just-minted token, shown ONCE */}
      {arca.newConnectorToken && (
        <div style={{ marginTop: 16 }}>
          <p className="note" style={{ color: "var(--accent)", marginTop: 0 }}>
            ⚠ Copy this token now — it is shown only once and cannot be recovered.
          </p>
          <CodeBlock code={arca.newConnectorToken} copyable />
          <div className="row">
            <Button variant="ghost" onClick={arca.dismissNewToken}>
              Done — I&apos;ve copied it
            </Button>
          </div>
        </div>
      )}

      {/* connector list */}
      {arca.connectors == null ? (
        <p className="note" style={{ marginTop: 16 }}>loading…</p>
      ) : list.length === 0 ? (
        <p className="note" style={{ marginTop: 16 }}>
          No agents connected yet. Add one below, or connect a web app (Claude.ai / ChatGPT) —
          it will appear here automatically.
        </p>
      ) : (
        <div style={{ marginTop: 16 }}>
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
                    onClick={() => arca.revokeConnector(c.id)}
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

      {/* add a CLI connector */}
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
        {active.length > 0 && (
          <span className="note" style={{ marginTop: 0 }}>
            {active.length} active
          </span>
        )}
      </div>

      {arca.connectorStatus.text && (
        <div className={`status ${arca.connectorStatus.kind}`}>{arca.connectorStatus.text}</div>
      )}
    </section>
  );
}
