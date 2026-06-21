"use client";

import { Button } from "@/components/atoms/Button";
import { KeyValue } from "@/components/atoms/KeyValue";

interface AccountPanelProps {
  account: string;
  onDisconnect: () => void;
}

// Shown once a wallet is connected: the address + a Disconnect button.
export function AccountPanel({ account, onDisconnect }: AccountPanelProps) {
  return (
    <div style={{ marginTop: 12 }}>
      <KeyValue label="Wallet" value={account} />
      <div className="row" style={{ marginTop: 10 }}>
        <Button onClick={onDisconnect}>Disconnect</Button>
      </div>
    </div>
  );
}
