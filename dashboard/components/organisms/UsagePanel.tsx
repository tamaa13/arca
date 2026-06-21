"use client";

import type { ArcaApi } from "@/hooks/useArca";

// Live storage tracker: remaining signer balance (auto-refreshed every 30s + on focus),
// memories saved (on-chain root count), a low-balance warning, and a link to the signer's
// on-chain activity (each save = one addRootFor tx). Shown once a session exists.
export function UsagePanel({ arca }: { arca: ArcaApi }) {
  if (!arca.session?.signerAddress) return null;
  return (
    <section className="step on" style={{ marginBottom: 18 }}>
      <h2>Your storage</h2>
      <div className="kv">
        <span>Remaining</span>
        <code style={arca.lowBalance ? { color: "var(--accent)" } : undefined}>
          {arca.balance != null ? `${arca.balance} 0G` : "…"}
        </code>
      </div>
      <div className="kv">
        <span>Memories saved</span>
        <code>{arca.saveCount != null ? String(arca.saveCount) : "…"}</code>
      </div>
      {arca.lowBalance && (
        <p className="note" style={{ color: "var(--accent)", marginTop: 8 }}>
          ⚠ Low — top up in the Deposit step or new saves will fail.
        </p>
      )}
      {arca.signerExplorerUrl && (
        <p className="note" style={{ marginTop: 8 }}>
          <a href={arca.signerExplorerUrl} target="_blank" rel="noreferrer">
            View activity ↗
          </a>{" "}
          — every save is an on-chain anchor by your session signer.
        </p>
      )}
    </section>
  );
}
