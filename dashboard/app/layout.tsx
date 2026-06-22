import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { MotionProvider } from "@/components/MotionProvider";
import { PaperNoise } from "@/components/PaperNoise";
import { IntroOverlay } from "@/components/IntroOverlay";
import { SoundProvider } from "@/components/sound/SoundProvider";
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
// BP Mono (free, attribution backpacker.gr) — every other bit of text (body + code).
const bpmono = localFont({
  src: [
    { path: "../public/fonts/bpmono/BPmono.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/bpmono/BPmonoBold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-bpmono",
});

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
      className={`${animal.variable} ${bpmono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <SoundProvider>
            <MotionProvider>
              <PaperNoise />
              <IntroOverlay />
              {children}
            </MotionProvider>
          </SoundProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
