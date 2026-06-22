"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/atoms/CodeBlock";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { KeyValue } from "@/components/atoms/KeyValue";
import { ConnectorTabs } from "@/components/molecules/ConnectorTabs";
import { snippets, signInSnippet, PLATFORM_AUTH, VERIFIED_LIVE } from "@/lib/snippets";
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
  const verified = VERIFIED_LIVE.includes(platform); // proven live vs works-by-spec (honesty caption)
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
    if (window.confirm(`Revoke "${c.label}"? This agent loses access to your memory immediately.`)) {
      void arca.revokeConnector(c.id);
    }
  };

  return (
    <section className="step on" style={{ marginBottom: 18 }}>
      <h2>Your agents</h2>
      <p>
        Connect any agent to your one shared memory. Most clients connect by <strong>signing in</strong> (no token);
        some use a token. Each connection is revocable on its own — if one is compromised, kill just that one.
      </p>

      {!ready && (
        <p className="note" style={{ color: "var(--accent)", marginTop: 14 }}>
          ⚠ Activate your memory first (step above). You can connect agents now, but they can&apos;t save
          until your memory is funded + authorized.
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
      {!verified && (
        <p className="note" style={{ marginTop: 8, color: "var(--muted)" }}>
          ⓘ Works by spec — verified live end-to-end so far: <strong>Claude Code</strong> +{" "}
          <strong>opencode</strong>. {platformLabel(platform)} not yet.
        </p>
      )}

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

      {/* connected agents — Active / Revoked tabs + pagination */}
      {arca.connectors == null ? (
        <p className="note" style={{ marginTop: 16 }}>loading…</p>
      ) : list.length === 0 ? (
        <p className="note" style={{ marginTop: 16 }}>
          No agents connected yet — connect one above (sign-in or token).
        </p>
      ) : (
        <ConnectorList list={list} onRevoke={onRevoke} busy={arca.connectorBusy} />
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

const PER_PAGE = 5;

// Active / Revoked tabs + pagination so a wallet with many tokens stays compact.
function ConnectorList({
  list,
  onRevoke,
  busy,
}: {
  list: ConnectorListing[];
  onRevoke: (c: ConnectorListing) => void;
  busy: boolean;
}) {
  const [view, setView] = useState<"active" | "revoked">("active");
  const [page, setPage] = useState(0);

  const active = list.filter((c) => !c.revoked);
  const revoked = list.filter((c) => c.revoked);
  const shown = view === "active" ? active : revoked;
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const items = shown.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);

  const select = (v: "active" | "revoked") => {
    setView(v);
    setPage(0);
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div className="tabs" style={{ marginTop: 0 }}>
        <button className={view === "active" ? "active" : ""} onClick={() => select("active")}>
          Active · {active.length}
        </button>
        <button className={view === "revoked" ? "active" : ""} onClick={() => select("revoked")}>
          Revoked · {revoked.length}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="note" style={{ marginTop: 14 }}>
          {view === "active" ? "No active agents." : "No revoked agents yet."}
        </p>
      ) : (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)" }}>
          {items.map((c) => (
            <ConnectorRow key={c.id} c={c} onRevoke={onRevoke} busy={busy} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <button className="copy" disabled={p === 0} onClick={() => setPage(p - 1)}>
            ← prev
          </button>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--muted)" }}>
            {p + 1} / {pages}
          </span>
          <button className="copy" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
            next →
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectorRow({ c, onRevoke, busy }: { c: ConnectorListing; onRevoke: (c: ConnectorListing) => void; busy: boolean }) {
  const st = statusOf(c);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "11px 0",
        borderBottom: "1px solid var(--line)",
        opacity: c.revoked ? 0.6 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 14, wordBreak: "break-word" }}>{c.label}</span>
          <span
            className="mono"
            style={{ fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", border: "1px solid var(--line-strong)", padding: "1px 6px", borderRadius: 9999 }}
          >
            {c.kind === "oauth" ? "Sign-in" : "Token"}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
          added {fmtDate(c.createdAt)} · <span style={{ color: st.color }}>{st.text}</span>
        </div>
      </div>
      {!c.revoked && (
        <Button variant="ghost" onClick={() => onRevoke(c)} disabled={busy} style={{ padding: "8px 16px", fontSize: 12, flexShrink: 0 }}>
          Revoke
        </Button>
      )}
    </div>
  );
}
