"use client";

import { useArca } from "@/hooks/useArca";
import { Header } from "@/components/organisms/Header";
import { ConnectWalletStep } from "@/components/organisms/ConnectWalletStep";
import { CreateSessionStep } from "@/components/organisms/CreateSessionStep";
import { ActivateStep } from "@/components/organisms/ActivateStep";
import { ApproveStep } from "@/components/organisms/ApproveStep";
import { UsagePanel } from "@/components/organisms/UsagePanel";
import { YourAgentsPanel } from "@/components/organisms/YourAgentsPanel";

export function Dashboard() {
  const arca = useArca();
  const registry = arca.session?.registry ?? "—";
  const isOAuth = !!arca.oauth;

  return (
    <div className="wrap">
      <Header />

      <h1>{isOAuth ? "Connect your vault." : "Open your vault."}</h1>
      <p className="lede">
        {isOAuth ? (
          <>
            <strong>{arca.oauthClient ?? "An app"}</strong> wants to connect to your Arca vault.
            Connect your wallet and sign to approve — Arca derives your key from that signature
            (never your private key) and encrypts your memory to your wallet on 0G, recoverable
            with your wallet alone.
          </>
        ) : (
          <>
            Connect your wallet, fund a little storage, and point any agent at one vault. Your memory
            is encrypted to your wallet and stored on 0G — yours alone.
          </>
        )}
      </p>

      {arca.session?.signerAddress && <UsagePanel arca={arca} />}

      {/* Progressive reveal: each step appears once the previous is done, so a first-time user
          never faces a wall of greyed-out cards. */}
      <ConnectWalletStep arca={arca} />
      {arca.step1Done && <CreateSessionStep arca={arca} />}
      {arca.step2Done && <ActivateStep arca={arca} />}
      {isOAuth
        ? arca.step1Done && <ApproveStep arca={arca} />
        : arca.session?.token && <YourAgentsPanel arca={arca} />}

      <div className="note">
        0G Galileo testnet · registry <span className="mono">{registry}</span>
      </div>
    </div>
  );
}
