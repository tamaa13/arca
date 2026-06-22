import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { MotionProvider } from "@/components/MotionProvider";
import { PaperNoise } from "@/components/PaperNoise";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
import "./globals.css";

// Animal — display/heading font (SIL OFL). Headings only; body + code stay readable.
const animal = localFont({
  src: [
    { path: "../public/fonts/animal/Animal-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/animal/Animal-Bold.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-animal",
});
const geist = Geist({ subsets: ["latin"], display: "swap", variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Arca — your memory",
  description:
    "One memory for all your agents. Connect your wallet, fund a little storage, and point any agent at one shared memory — encrypted to your wallet and stored on 0G, yours alone.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${animal.variable} ${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <MotionProvider>
            <PaperNoise />
            {children}
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
