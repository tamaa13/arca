"use client";

import { useArca } from "@/hooks/useArca";
import { Header } from "@/components/organisms/Header";
import { ConnectWalletStep } from "@/components/organisms/ConnectWalletStep";
import { CreateSessionStep } from "@/components/organisms/CreateSessionStep";
import { DepositStep } from "@/components/organisms/DepositStep";
import { AuthorizeStep } from "@/components/organisms/AuthorizeStep";
import { ConnectorStep } from "@/components/organisms/ConnectorStep";
import { ApproveStep } from "@/components/organisms/ApproveStep";

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
            Connect your wallet and sign to approve — your memory stays encrypted to your wallet on
            0G, and the app never sees your key.
          </>
        ) : (
          <>
            Connect your wallet, fund a little storage, and point any agent at one vault. Your memory
            is encrypted to your wallet and stored on 0G — yours alone.
          </>
        )}
      </p>

      <ConnectWalletStep arca={arca} />
      <CreateSessionStep arca={arca} />
      <DepositStep arca={arca} />
      <AuthorizeStep arca={arca} />
      {isOAuth ? <ApproveStep arca={arca} /> : <ConnectorStep arca={arca} />}

      <div className="note">
        0G Galileo testnet · registry <span className="mono">{registry}</span>
      </div>
    </div>
  );
}
