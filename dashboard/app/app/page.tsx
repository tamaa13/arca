import type { Metadata } from "next";
import { AppDashboard } from "@/components/templates/AppDashboard";

export const metadata: Metadata = {
  title: "Arca — app",
  description: "Connect your wallet, fund storage, and connect your agents to your memory on 0G.",
};

export default function AppPage() {
  return <AppDashboard />;
}
