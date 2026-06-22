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
        <Button onClick={arca.sign} disabled={!arca.signEnabled || arca.step2Done || arca.signing}>
          {arca.step2Done ? "Session created ✓" : arca.signing ? "Signing…" : "Sign & create session"}
        </Button>
      </div>
      <StatusLine status={arca.st2} />
      {/* We deliberately DON'T surface the raw session bearer here — agents connect with their
          own revocable per-agent tokens (see "Your agents"). Show only the signer address (the
          deposit target). */}
      {arca.session?.signerAddress ? (
        <div style={{ marginTop: 12 }}>
          <KeyValue label="Session signer" value={arca.session.signerAddress} />
        </div>
      ) : null}
    </StepCard>
  );
}
