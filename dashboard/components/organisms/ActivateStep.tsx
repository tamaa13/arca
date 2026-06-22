"use client";

import { useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { StatusLine } from "@/components/atoms/StatusLine";
import { StepCard } from "@/components/molecules/StepCard";
import { ZeroG, zeroG } from "@/components/atoms/ZeroG";
import type { ArcaApi } from "@/hooks/useArca";

// One step that funds the session-signer AND authorizes it as a registry delegate (two wallet
// popups, one action). This is what lets your agents save under your wallet without it signing
// per memory. Re-runnable: it skips whichever on-chain action is already done.
// `optional` (OAuth consent mode): funding isn't needed to APPROVE/connect — only before the first
// save — so the copy/number demote it below the consent step.
export function ActivateStep({ arca, n = 3, optional = false }: { arca: ArcaApi; n?: number; optional?: boolean }) {
  const [amount, setAmount] = useState("0.1");
  const done = arca.step3Done && arca.step4Done;

  return (
    <StepCard
      n={n}
      title={optional ? "Fund your memory" : "Activate your memory"}
      description={
        optional
          ? "Optional now — you can approve and connect first. Fund (deposit + authorize) before your first save so your agents can write under your wallet."
          : "Fund a little 0G and authorize your signer — in one step. This lets any agent save under your wallet, without your wallet signing per memory."
      }
      on={arca.step2Done}
      done={done}
    >
      <div className="row">
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={arca.activating || done} />
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}><ZeroG /></span>
        <Button onClick={() => arca.activate(amount)} disabled={arca.activating || done || !arca.depositEnabled}>
          {done ? "Memory active ✓" : arca.activating ? "…" : "Activate memory"}
        </Button>
        {!done && (
          <span className="note" style={{ marginTop: 0 }}>{zeroG("~0.1 0G ≈ 200 saves")}</span>
        )}
      </div>
      <StatusLine status={arca.st3} />
    </StepCard>
  );
}
