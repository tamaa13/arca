import type { Metadata } from "next";
import { AppDashboard } from "@/components/templates/AppDashboard";
import { Web3Provider } from "@/components/web3/Web3Provider";

export const metadata: Metadata = {
  title: "Arca — app",
  description: "Connect your wallet, fund storage, and connect your agents to your memory on 0G.",
};

export default function AppPage() {
  return (
    <Web3Provider>
      <AppDashboard />
    </Web3Provider>
  );
}
