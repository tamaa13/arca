"use client";

import { CustomConnectButton } from "@/components/web3/CustomConnectButton";
import { StatusLine } from "@/components/atoms/StatusLine";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

export function ConnectWalletStep({ arca }: { arca: ArcaApi }) {
  return (
    <StepCard
      n={1}
      title="Connect wallet"
      description="Connect any wallet — MetaMask, Rabby, Coinbase, or WalletConnect. Arca runs on 0G and connects your wallet to the right network automatically; it never sees your private key."
      on // step 1 is active by default
      done={arca.step1Done}
    >
      <div className="row">
        <CustomConnectButton />
      </div>
      <StatusLine status={arca.st1} />
    </StepCard>
  );
}
