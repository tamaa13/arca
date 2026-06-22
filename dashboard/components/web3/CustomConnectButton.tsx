"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

// Arca-styled connect button (keeps RainbowKit's wallet modal): a pill that matches the site —
// solid ink "Connect wallet" when disconnected, a wallet chip with a live dot + network when
// connected, and a clear "wrong network" state. No network switcher — there's only one chain.
const base = {
  borderRadius: 9999,
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  cursor: "pointer",
  transition: "opacity .15s ease",
} as const;

export function CustomConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        return (
          <div style={{ opacity: mounted ? 1 : 0, pointerEvents: mounted ? "auto" : "none" }}>
            {!connected ? (
              <button
                type="button"
                onClick={openConnectModal}
                style={{ ...base, fontSize: 13.5, padding: "11px 22px", background: "var(--color-ink)", color: "var(--color-cream)", border: "1px solid var(--color-ink)" }}
              >
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                style={{ ...base, fontSize: 13, padding: "11px 18px", background: "transparent", color: "var(--color-warn)", border: "1px solid var(--color-warn)" }}
              >
                Wrong network — switch
              </button>
            ) : (
              <button
                type="button"
                onClick={openAccountModal}
                style={{ ...base, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 12.5, padding: "9px 15px", background: "var(--color-paper)", color: "var(--color-ink)", border: "1px solid var(--color-border-strong)" }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--color-ok)", flexShrink: 0 }} />
                <span>{account.displayName}</span>
                <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-3)" }}>
                  {chain.name?.replace(/^0G\s*/, "")}
                </span>
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
