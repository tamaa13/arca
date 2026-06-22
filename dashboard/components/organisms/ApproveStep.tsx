"use client";

import Link from "next/link";
import { Button } from "@/components/atoms/Button";
import { StepCard } from "@/components/molecules/StepCard";
import type { ArcaApi } from "@/hooks/useArca";

// OAuth-mode replacement for the connector step (step 5): an explicit consent card.
// Shown only when the dashboard is served at /authorize. After the user signs (step 2)
// we have a redirect back to the requesting web client; the user clicks to approve.
export function ApproveStep({ arca, n = 5 }: { arca: ArcaApi; n?: number }) {
  const ready = !!arca.oauthRedirect;
  return (
    <StepCard
      n={n}
      title="Approve & connect"
      description={`Connect your Arca memory to ${arca.oauthClient ?? "this app"}. They’ll read & write your one shared memory, encrypted to your wallet — you can revoke on-chain anytime.`}
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
        authorization code. Arca derives your key from your signature (never your private key);
        your memory stays encrypted to your wallet on 0G.
      </p>
      <p className="note" style={{ marginTop: 10 }}>
        {/* Web/OAuth users can't manage connectors on this consent screen (no bearer here). The
            bare dashboard origin restores a real session + renders the agents manager. */}
        Want to see or revoke your connected agents? Open the{" "}
        <Link href="/app">Arca dashboard</Link>.
      </p>
    </StepCard>
  );
}
