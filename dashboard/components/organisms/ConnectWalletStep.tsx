"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { StatusLine } from "@/components/atoms/StatusLine";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

export function ConnectWalletStep({ arca }: { arca: ArcaApi }) {
  return (
    <StepCard
      n={1}
      title="Connect wallet"
      description="Connect any wallet — MetaMask, Rabby, Coinbase, or WalletConnect — on 0G. Pick Galileo testnet to use Arca today. Arca never sees your private key."
      on // step 1 is active by default
      done={arca.step1Done}
    >
      <div className="row">
        <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />
      </div>
      <StatusLine status={arca.st1} />
    </StepCard>
  );
}
