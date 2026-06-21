"use client";

import { useState } from "react";
import { KeyValue } from "@/components/atoms/KeyValue";
import { CodeBlock } from "@/components/atoms/CodeBlock";
import { StepCard } from "@/components/molecules/StepCard";
import { ConnectorTabs } from "@/components/molecules/ConnectorTabs";
import { snippets } from "@/lib/snippets";
import type { Platform } from "@/lib/constants";
import type { ArcaApi } from "@/hooks/useArca";

export function ConnectorStep({ arca }: { arca: ArcaApi }) {
  const [platform, setPlatform] = useState<Platform>("claude");
  const d = arca.session;
  const snippet = d ? snippets(d.connectorUrl, d.token)[platform] : "connect first…";

  return (
    <StepCard
      n={5}
      title="Connect your agents"
      description="Add this connector to any agent. They all read & write the one vault, encrypted to your wallet."
      on={arca.step5On}
    >
      <KeyValue label="Endpoint" value={d?.connectorUrl ?? ""} style={{ marginTop: 14 }} />
      <ConnectorTabs active={platform} onSelect={setPlatform} />
      <p className="note" style={{ marginTop: 10 }}>
        Remote MCP — nothing to install (no <code>npm/bun add</code>). Just register the URL + token.
      </p>
      <CodeBlock code={snippet} copyable={!!d} />
      <p style={{ marginTop: 14 }}>
        Your memory is recoverable directly from 0G with your wallet, even without Arca.
      </p>
    </StepCard>
  );
}
