"use client";

import { useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { StatusLine } from "@/components/atoms/StatusLine";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

export function DepositStep({ arca }: { arca: ArcaApi }) {
  const [amount, setAmount] = useState("0.1");

  return (
    <StepCard
      n={3}
      title="Deposit storage"
      description="Fund the session-signer with a little 0G. It pays gas + storage for your saves so your wallet never signs per memory. Withdrawable anytime — it's yours."
      on={arca.step3On}
      done={arca.step3Done}
    >
      <div className="row">
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
          0G
        </span>
        <Button onClick={() => arca.deposit(amount)} disabled={!arca.depositEnabled}>
          Deposit
        </Button>
      </div>
      <StatusLine status={arca.st3} />
    </StepCard>
  );
}
