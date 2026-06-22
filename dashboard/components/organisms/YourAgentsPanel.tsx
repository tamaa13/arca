"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/atoms/CodeBlock";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { KeyValue } from "@/components/atoms/KeyValue";
import { ConnectorTabs } from "@/components/molecules/ConnectorTabs";
import { snippets, signInSnippet, PLATFORM_AUTH } from "@/lib/snippets";
import { platformLabel } from "@/lib/snippets";
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

// The SINGLE place to connect + manage agents. Two methods, picked per client:
//  - Sign-in (Claude / Cursor / opencode): add the URL → approve by signing. No token.
//  - Token (Codex / raw HTTP): mint a per-agent token and paste it.
// Both appear in the list, each individually revocable. Web apps connect via sign-in too.
export function YourAgentsPanel({ arca }: { arca: ArcaApi }) {
  const [platform, setPlatform] = useState<Platform>("claude");
  const [label, setLabel] = useState("");
  const d = arca.session;
  if (!d?.token) return null;

  const isSignin = PLATFORM_AUTH[platform] === "signin";
  const ready = arca.step3Done && arca.step4Done; // funded AND authorized = saves will work
  const list = arca.connectors ?? [];
  // Token clients see a config TEMPLATE with a placeholder (never an embedded token — that made the
  // same minted token appear across every platform tab). The actual token is created separately
  // below and shown ONCE, so each agent gets its own.
  const PLACEHOLDER = "PASTE_YOUR_TOKEN";
  const tokenConfig = !isSignin ? snippets(d.connectorUrl, PLACEHOLDER)[platform] : null;

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
        Connect any agent to your one vault. Most clients connect by <strong>signing in</strong> (no token);
        some use a token. Each connection is revocable on its own — if one is compromised, kill just that one.
      </p>

      {!ready && (
        <p className="note" style={{ color: "var(--accent)", marginTop: 14 }}>
          ⚠ Activate your vault first (step above). You can connect agents now, but they can&apos;t save
          until your vault is funded + authorized.
        </p>
      )}

      <KeyValue label="Endpoint" value={d.connectorUrl} style={{ marginTop: 14 }} />
      <ConnectorTabs active={platform} onSelect={setPlatform} />

      {isSignin ? (
        <p className="note" style={{ marginTop: 10 }}>
          Add this to {platformLabel(platform)} — it opens the Arca sign-in → connect your wallet + sign once
          to approve. <strong>No token to paste.</strong>
        </p>
      ) : (
        <p className="note" style={{ marginTop: 10 }}>
          {platformLabel(platform)} connects with a token. Add this config, then create a token below and paste
          it where it says <code>{PLACEHOLDER}</code> — one token per agent.
        </p>
      )}
      <CodeBlock code={isSignin ? signInSnippet(d.connectorUrl, platform) : tokenConfig!} copyable />

      {/* Create a token (one per agent) — primary for token clients, fallback for sign-in clients */}
      <p className="note" style={{ marginTop: 14 }}>
        {isSignin
          ? `${platformLabel(platform)} doesn't support sign-in? Create a token instead:`
          : "Create a token to paste above:"}
      </p>
      <div className="row">
        <Input
          type="text"
          placeholder="name this agent, e.g. opencode-laptop"
          value={label}
          maxLength={64}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !arca.connectorBusy) void onAdd(); }}
          disabled={arca.connectorBusy}
          style={{ width: 240 }}
        />
        <Button onClick={onAdd} disabled={arca.connectorBusy || !label.trim()}>
          {arca.connectorBusy ? "…" : "Create token"}
        </Button>
      </div>
      {arca.newConnectorToken && (
        <div style={{ marginTop: 12 }}>
          <p className="note" style={{ color: "var(--accent)", marginTop: 0 }}>
            ⚠ Your new token — copy it now (shown only once). Paste it into the config above
            {isSignin ? "." : <> where it says <code>{PLACEHOLDER}</code>.</>}
          </p>
          <CodeBlock code={arca.newConnectorToken} copyable />
          <div className="row">
            <Button variant="ghost" onClick={arca.dismissNewToken}>
              Done — I&apos;ve copied it
            </Button>
          </div>
        </div>
      )}

      <p className="note" style={{ marginTop: 14 }}>
        Web app (Claude.ai / ChatGPT)? Add the endpoint above as a custom connector and sign in — it appears
        in the list below automatically, revocable like any other.
      </p>

      {/* connected agents list */}
      {arca.connectors == null ? (
        <p className="note" style={{ marginTop: 16 }}>loading…</p>
      ) : list.length === 0 ? (
        <p className="note" style={{ marginTop: 16 }}>
          No agents connected yet — connect one above (sign-in or token).
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
                      {c.kind === "oauth" ? "Sign-in" : "Token"}
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
