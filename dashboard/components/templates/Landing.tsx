import { Navbar } from "@/components/organisms/Navbar";
import { Hero } from "@/components/hero/Hero";
import { ValueProp } from "@/components/landing/ValueProp";
import { Claims } from "@/components/landing/Claims";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Footer } from "@/components/landing/Footer";

// Marketing landing — hero → statement → why (features) → how it works → CTA → footer.
// The functional dashboard lives separately at /app.
export function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <ValueProp />
      <Claims />
      <HowItWorks />
      <ClosingCta />
      <Footer />
    </>
  );
}

function ClosingCta() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-24 sm:px-8">
      <div className="flex flex-col items-center gap-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-paper)] px-8 py-16 text-center shadow-[var(--shadow-card)]">
        <h2 className="font-display text-[clamp(26px,3.4vw,42px)] leading-[1.05] tracking-[-0.015em] text-[var(--color-ink)]">
          One memory. Every agent. Yours.
        </h2>
        <p className="max-w-[48ch] text-[14px] leading-[1.6] text-[var(--color-ink-2)]">
          Connect your wallet, fund a little storage, and point any agent at one shared memory on 0G.
        </p>
        <a
          href="/app"
          className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-7 py-3.5 text-[14px] font-medium tracking-tight text-[var(--color-cream)] shadow-[var(--shadow-pill)] transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ border: "none" }}
        >
          <span>Open your memory</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>
    </section>
  );
}
