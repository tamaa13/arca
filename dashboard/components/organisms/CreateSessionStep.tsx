"use client";

import { Button } from "@/components/atoms/Button";
import { StatusLine } from "@/components/atoms/StatusLine";
import { KeyValue } from "@/components/atoms/KeyValue";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

export function CreateSessionStep({ arca }: { arca: ArcaApi }) {
  return (
    <StepCard
      n={2}
      title="Create session"
      description="Sign one structured message. Arca derives your encryption key from the signature (never your private key) and issues a connector token."
      on={arca.step2On}
      done={arca.step2Done}
    >
      <div className="row">
        <Button onClick={arca.sign} disabled={!arca.signEnabled}>
          Sign &amp; create session
        </Button>
      </div>
      <StatusLine status={arca.st2} />
      {arca.session ? (
        <div style={{ marginTop: 12 }}>
          <KeyValue label="Token" value={arca.session.token} />
          <KeyValue label="Session signer" value={arca.session.signerAddress} />
        </div>
      ) : null}
    </StepCard>
  );
}
