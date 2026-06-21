"use client";

import { Button } from "@/components/atoms/Button";
import { StatusLine } from "@/components/atoms/StatusLine";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

export function AuthorizeStep({ arca }: { arca: ArcaApi }) {
  return (
    <StepCard
      n={4}
      title="Authorize the signer"
      description="One transaction: register the session-signer as a delegate so it can anchor memories under your wallet on the registry."
      on={arca.step4On}
      done={arca.step4Done}
    >
      <div className="row">
        <Button onClick={arca.authorize} disabled={!arca.delegateEnabled}>
          Authorize (setDelegate)
        </Button>
      </div>
      <StatusLine status={arca.st4} />
    </StepCard>
  );
}
