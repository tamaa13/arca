"use client";

import { useArca } from "@/hooks/useArca";
import { Navbar } from "@/components/organisms/Navbar";
import { ConnectWalletStep } from "@/components/organisms/ConnectWalletStep";
import { CreateSessionStep } from "@/components/organisms/CreateSessionStep";
import { ActivateStep } from "@/components/organisms/ActivateStep";
import { ApproveStep } from "@/components/organisms/ApproveStep";
import { UsagePanel } from "@/components/organisms/UsagePanel";
import { YourAgentsPanel } from "@/components/organisms/YourAgentsPanel";
import { Footer } from "@/components/landing/Footer";

// The functional app — connect wallet · sign · activate · connect agents (and the
// OAuth consent flow). Lives at /app and at /authorize; the landing is separate.
export function AppDashboard() {
  const arca = useArca();
  const registry = arca.session?.registry ?? "—";
  const isOAuth = !!arca.oauth;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="wrap flex-1" id="connect" style={{ paddingTop: 92 }}>
        <h1>{isOAuth ? "Connect your memory." : "Open your memory."}</h1>
        <p className="lede">
          {isOAuth ? (
            <>
              <strong>{arca.oauthClient ?? "An app"}</strong> wants to connect to your Arca memory.
              Connect your wallet and sign to approve — Arca derives your key from that signature
              (never your private key) and encrypts your memory to your wallet on 0G, recoverable
              with your wallet alone.
            </>
          ) : (
            <>
              Connect your wallet, fund a little storage, and point any agent at one shared memory.
              It&apos;s encrypted to your wallet and stored on 0G — yours alone.
            </>
          )}
        </p>

        {arca.session?.signerAddress && <UsagePanel arca={arca} />}

        {/* Progressive reveal: each step appears once the previous is done. */}
        <ConnectWalletStep arca={arca} />
        {arca.step1Done && <CreateSessionStep arca={arca} />}
        {isOAuth ? (
          <>
            {arca.step2Done && <ApproveStep arca={arca} n={3} />}
            {arca.step2Done && <ActivateStep arca={arca} n={4} optional />}
          </>
        ) : (
          <>
            {arca.step2Done && <ActivateStep arca={arca} />}
            {arca.session?.token && <YourAgentsPanel arca={arca} />}
          </>
        )}

        <div className="note">
          0G Galileo testnet · registry <span className="mono">{registry}</span>
        </div>
      </div>
      <Footer />
    </div>
  );
}
