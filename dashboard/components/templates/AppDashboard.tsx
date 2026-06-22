"use client";

import { useArca, type ArcaApi } from "@/hooks/useArca";
import { Navbar } from "@/components/organisms/Navbar";
import { ConnectWalletStep } from "@/components/organisms/ConnectWalletStep";
import { CreateSessionStep } from "@/components/organisms/CreateSessionStep";
import { ActivateStep } from "@/components/organisms/ActivateStep";
import { ApproveStep } from "@/components/organisms/ApproveStep";
import { UsagePanel } from "@/components/organisms/UsagePanel";
import { YourAgentsPanel } from "@/components/organisms/YourAgentsPanel";
import { Footer } from "@/components/landing/Footer";
import { ZeroG } from "@/components/atoms/ZeroG";

// The functional app — connect wallet · sign · activate · connect agents (and the OAuth consent
// flow). Wider 2-column layout: the setup flow on the left, a sticky status/usage rail on the
// right, and the agents panel full-width below — so it scans without a long vertical scroll.
export function AppDashboard() {
  const arca = useArca();
  const registry = arca.session?.registry ?? "—";
  const isOAuth = !!arca.oauth;
  const netName = arca.session?.chainId === 16661 ? "Aristotle mainnet" : arca.session?.chainId === 16602 ? "Galileo testnet" : "0G";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main
        className="mx-auto w-full flex-1 px-6 sm:px-8"
        id="connect"
        style={{ maxWidth: 1080, paddingTop: 92, paddingBottom: 96 }}
      >
        <h1>{isOAuth ? "Connect your memory." : "Open your memory."}</h1>
        <p className="lede">
          {isOAuth ? (
            <>
              <strong>{arca.oauthClient ?? "An app"}</strong> wants to connect to your Arca memory.
              Connect your wallet and sign to approve — Arca derives your key from that signature
              (never your private key) and encrypts your memory to your wallet on <ZeroG />, recoverable
              with your wallet alone.
            </>
          ) : (
            <>
              Connect your wallet, fund a little storage, and point any agent at one shared memory.
              It&apos;s encrypted to your wallet and stored on <ZeroG /> — yours alone.
            </>
          )}
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
          {/* setup flow (progressive reveal) */}
          <div className="flex min-w-0 flex-col">
            <ConnectWalletStep arca={arca} />
            {arca.step1Done && <CreateSessionStep arca={arca} />}
            {isOAuth ? (
              <>
                {arca.step2Done && <ApproveStep arca={arca} n={3} />}
                {arca.step2Done && <ActivateStep arca={arca} n={4} optional />}
              </>
            ) : (
              arca.step2Done && <ActivateStep arca={arca} />
            )}
          </div>

          {/* sticky status + usage rail */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <StatusRail arca={arca} isOAuth={isOAuth} />
            {arca.session?.signerAddress && <UsagePanel arca={arca} />}
          </aside>
        </div>

        {/* agents — full width (needs room for tabs + snippets) */}
        {!isOAuth && arca.session?.token && <YourAgentsPanel arca={arca} />}

        <div className="note">
          {netName} · registry <span className="mono">{registry}</span>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatusRail({ arca, isOAuth }: { arca: ArcaApi; isOAuth: boolean }) {
  const steps = isOAuth
    ? [
        { l: "Connect wallet", d: arca.step1Done },
        { l: "Sign", d: arca.step2Done },
        { l: "Approve connection", d: !!arca.oauthRedirect },
        { l: "Fund (optional)", d: arca.step3Done && arca.step4Done },
      ]
    : [
        { l: "Connect wallet", d: arca.step1Done },
        { l: "Create session", d: arca.step2Done },
        { l: "Activate memory", d: arca.step3Done && arca.step4Done },
        { l: "Connect agents", d: (arca.connectors?.filter((c) => !c.revoked).length ?? 0) > 0 },
      ];
  return (
    <section className="step on" style={{ marginTop: 0 }}>
      <h2>Setup</h2>
      <div style={{ marginTop: 12 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 9999,
                border: "1.5px solid",
                borderColor: s.d ? "var(--accent)" : "var(--line-strong)",
                background: s.d ? "var(--accent)" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {s.d && <span style={{ color: "var(--paper)", fontSize: 9, lineHeight: 1 }}>✓</span>}
            </span>
            <span style={{ fontSize: 13, color: s.d ? "var(--ink)" : "var(--muted)" }}>{s.l}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
