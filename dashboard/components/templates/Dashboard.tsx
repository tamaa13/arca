"use client";

import { useArca } from "@/hooks/useArca";
import { Header } from "@/components/organisms/Header";
import { ConnectWalletStep } from "@/components/organisms/ConnectWalletStep";
import { CreateSessionStep } from "@/components/organisms/CreateSessionStep";
import { DepositStep } from "@/components/organisms/DepositStep";
import { AuthorizeStep } from "@/components/organisms/AuthorizeStep";
import { ConnectorStep } from "@/components/organisms/ConnectorStep";

export function Dashboard() {
  const arca = useArca();
  const registry = arca.session?.registry ?? "—";

  return (
    <div className="wrap">
      <Header />

      <h1>Open your vault.</h1>
      <p className="lede">
        Connect your wallet, fund a little storage, and point any agent at one vault. Your memory
        is encrypted to your wallet and stored on 0G — yours alone.
      </p>

      <ConnectWalletStep arca={arca} />
      <CreateSessionStep arca={arca} />
      <DepositStep arca={arca} />
      <AuthorizeStep arca={arca} />
      <ConnectorStep arca={arca} />

      <div className="note">
        0G Galileo testnet · registry <span className="mono">{registry}</span>
      </div>
    </div>
  );
}
