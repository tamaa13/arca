"use client";

import { Button } from "@/components/atoms/Button";
import { StatusLine } from "@/components/atoms/StatusLine";
import { StepCard } from "@/components/molecules/StepCard";
import { AccountPanel } from "@/components/molecules/AccountPanel";
import type { ArcaApi } from "@/hooks/useArca";

export function ConnectWalletStep({ arca }: { arca: ArcaApi }) {
  return (
    <StepCard
      n={1}
      title="Connect wallet"
      description="Sign in with your own wallet (MetaMask / any injected wallet) on 0G Galileo testnet. Arca never sees your private key."
      on // step 1 is active by default
      done={arca.step1Done}
    >
      <div className="row">
        <Button onClick={arca.connect}>Connect wallet</Button>
      </div>
      <StatusLine status={arca.st1} />
      {arca.account ? (
        <AccountPanel account={arca.account} onDisconnect={arca.disconnect} />
      ) : null}
    </StepCard>
  );
}
