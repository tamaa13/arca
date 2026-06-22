"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, getDefaultConfig, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { useTheme } from "@/components/theme/ThemeProvider";
import { APP_CHAIN, zgMainnet, zgTestnet } from "@/lib/chains";

// WalletConnect Cloud projectId (public — safe to ship). Enables the mobile/WC wallet list.
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "8587a9582464416581ee66bc24063ac9";
const queryClient = new QueryClient();

const wallets = [
  { groupName: "Connect a wallet", wallets: [injectedWallet, metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet] },
];

const chainFor = (id: number) => (id === zgMainnet.id ? zgMainnet : zgTestnet);

// Lets users connect any wallet (RainbowKit picker) on the network this deployment runs. The chain
// is AUTO-DETECTED from the server's /health (it reports its chainId) — switch the server to mainnet
// and the dashboard follows, no rebuild, no chain mismatch. Falls back to the build default.
export function Web3Provider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/health")
      .then((r) => r.json())
      .then((d: { chainId?: number }) => {
        if (alive) setChainId(Number(d?.chainId) || APP_CHAIN.id);
      })
      .catch(() => {
        if (alive) setChainId(APP_CHAIN.id);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (chainId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="font-mono-x text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">connecting…</span>
      </div>
    );
  }
  return <Web3Ready chainId={chainId}>{children}</Web3Ready>;
}

function Web3Ready({ chainId, children }: { chainId: number; children: ReactNode }) {
  const { resolved } = useTheme();
  const config = useMemo(
    () => getDefaultConfig({ appName: "Arca", projectId: WC_PROJECT_ID, chains: [chainFor(chainId)], ssr: false, wallets }),
    [chainId],
  );
  const rkTheme = useMemo(() => {
    const base = { accentColor: "#2a3858", accentColorForeground: "#f9f8f6", borderRadius: "large" as const };
    return resolved === "dark"
      ? darkTheme({ ...base, accentColor: "#93a7d6", accentColorForeground: "#0e0d0a" })
      : lightTheme(base);
  }, [resolved]);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={chainFor(chainId)} theme={rkTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
