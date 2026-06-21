"use client";

import { Button } from "@/components/atoms/Button";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

// OAuth-mode replacement for the connector step (step 5): an explicit consent card.
// Shown only when the dashboard is served at /authorize. After the user signs (step 2)
// we have a redirect back to the requesting web client; the user clicks to approve.
export function ApproveStep({ arca }: { arca: ArcaApi }) {
  const ready = !!arca.oauthRedirect;
  return (
    <StepCard
      n={5}
      title="Approve & connect"
      description={`Connect your Arca vault to ${arca.oauthClient ?? "this app"}. They’ll read & write your one vault, encrypted to your wallet — you can revoke on-chain anytime.`}
      on={arca.step5On}
    >
      <div className="row" style={{ marginTop: 12 }}>
        <Button
          onClick={() => {
            if (arca.oauthRedirect) window.location.href = arca.oauthRedirect;
          }}
          disabled={!ready}
        >
          {ready ? `Approve & continue to ${arca.oauthClient ?? "app"}` : "Sign above to continue"}
        </Button>
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        Approving redirects you back to {arca.oauthClient ?? "the app"} with a one-time
        authorization code. Your wallet signature stays encrypted to Arca; the app never sees your key.
      </p>
    </StepCard>
  );
}
