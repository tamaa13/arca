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
import { useMemo, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { useTheme } from "@/components/theme/ThemeProvider";
import { zgMainnet, zgTestnet } from "@/lib/chains";

// WalletConnect needs a (free) Cloud projectId for the mobile/WC wallet list. Injected
// (MetaMask/Rabby/Brave) + Coinbase work without it. Set NEXT_PUBLIC_WC_PROJECT_ID to enable WC.
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "arca_dev_placeholder";

const config = getDefaultConfig({
  appName: "Arca",
  projectId: WC_PROJECT_ID,
  chains: [zgTestnet, zgMainnet],
  ssr: false,
  // injectedWallet ("Browser Wallet") connects via the raw window.ethereum — covers Rabby/
  // Brave/any injected and is the most universal option.
  wallets: [
    {
      groupName: "Connect a wallet",
      wallets: [injectedWallet, metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
});

const queryClient = new QueryClient();

// Lets users connect ANY wallet (RainbowKit picker) and switch between 0G testnet/mainnet.
// Wraps only the app/OAuth surface so the landing bundle stays wagmi-free.
export function Web3Provider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  const rkTheme = useMemo(() => {
    const base = { accentColor: "#2a3858", accentColorForeground: "#f9f8f6", borderRadius: "large" as const };
    return resolved === "dark"
      ? darkTheme({ ...base, accentColor: "#93a7d6", accentColorForeground: "#0e0d0a" })
      : lightTheme(base);
  }, [resolved]);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={zgTestnet} theme={rkTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
