"use client";

import { Reveal } from "@/components/Reveal";
import { Parallax } from "@/components/Parallax";

// Big centered statement band (pieterkoopt's philosophical-line pattern), adapted.
export function ValueProp() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 py-24 text-center sm:px-8 sm:py-32">
      <Parallax speed={36}>
        <Reveal>
          <h2 className="font-display mx-auto max-w-[16ch] text-[clamp(34px,6vw,78px)] leading-[1.0] tracking-[-0.02em] text-[var(--color-ink)]">
            Your agents forget. Your memory shouldn&apos;t.
          </h2>
          <p className="mx-auto mt-7 max-w-[54ch] text-[15px] leading-[1.65] text-[var(--color-ink-2)]">
            Switch models, switch apps, start a new chat — your context resets every time. Arca gives every
            agent one shared memory, encrypted to your wallet on 0G, that you actually own.
          </p>
        </Reveal>
      </Parallax>
    </section>
  );
}
