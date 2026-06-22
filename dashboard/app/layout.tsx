import type { Metadata, Viewport } from "next";
import { Geist_Mono, Playfair_Display, Space_Grotesk } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { PaperNoise } from "@/components/PaperNoise";
import { IntroOverlay } from "@/components/IntroOverlay";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { SoundProvider } from "@/components/sound/SoundProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
import "./globals.css";

// pieterkoopt-style pairing (free look-alikes for the licensed Basis Grotesque / IvyPresto):
//   display (elegant serif headlines)  → Playfair Display  (≈ IvyPresto Headline)
//   body / UI (grotesque sans)         → Space Grotesk     (≈ Basis Grotesque)
//   mono / technical                   → Geist Mono        (exact)
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], display: "swap", variable: "--font-playfair" });
const space = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-space" });
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
      className={`${playfair.variable} ${space.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ConsentProvider>
          <ThemeProvider>
            <SoundProvider>
              <MotionProvider>
                <PaperNoise />
                <IntroOverlay />
                {children}
              </MotionProvider>
            </SoundProvider>
          </ThemeProvider>
        </ConsentProvider>
      </body>
    </html>
  );
}
