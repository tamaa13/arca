"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useConsent, type ConsentCategories } from "@/components/consent/ConsentProvider";
import { EASE } from "@/lib/motion";

const SOFT = [0.16, 1, 0.3, 1] as const; // expressive ease-out for the zoom + settle
const ARCA_BIG = 86; // loading hero size (px); the scale-in makes it fill the screen
const ARCA_REST = 34; // size once it settles into the panel

// First-visit intro (landing only): ARCA zooms in from full-screen, then SHRINKS in place
// into a real cookie-consent panel (essential / preferences / analytics). Skipped for OAuth.
export function IntroOverlay() {
  const { save } = useConsent();
  const [phase, setPhase] = useState<"init" | "loading" | "choose" | "done">("init");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Landing only — never block the functional app (/app) or docs.
    const onLanding = window.location.pathname === "/" || window.location.pathname === "/index.html";
    const entered = window.localStorage.getItem("arca-entered") === "1";
    const isOAuth = window.location.search.includes("client_id");
    if (!onLanding || entered || isOAuth) {
      setPhase("done");
      return;
    }
    setPhase("loading");
    const t = setTimeout(() => setPhase("choose"), 2000);
    return () => clearTimeout(t);
  }, []);

  const finish = useCallback(
    (cats: ConsentCategories) => {
      save(cats); // record real consent
      if (typeof window !== "undefined") window.localStorage.setItem("arca-entered", "1");
      setPhase("done");
    },
    [save],
  );

  const loading = phase === "loading";
  const visible = phase === "loading" || phase === "choose";

  // Lock the page while the intro is up — the landing renders behind this fixed overlay,
  // so without this the hidden page (and Lenis smooth-scroll) would scroll under it.
  useEffect(() => {
    if (typeof document === "undefined" || !visible) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const stop = () => window.__lenis?.stop();
    stop();
    const raf = requestAnimationFrame(stop);
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      cancelAnimationFrame(raf);
      window.__lenis?.start();
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="ambient-wash fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-6"
        >
          <div className="relative flex w-full max-w-[460px] flex-col items-center gap-7 text-center">
            <motion.span
              initial={{ opacity: 0, scale: 3.3, letterSpacing: "0.62em" }}
              animate={{ opacity: 1, scale: 1, letterSpacing: "0.2em", fontSize: loading ? ARCA_BIG : ARCA_REST }}
              transition={{
                opacity: { duration: 0.7, ease: EASE },
                scale: { duration: 1.3, ease: SOFT },
                letterSpacing: { duration: 1.3, ease: SOFT },
                fontSize: { duration: 0.7, ease: SOFT },
              }}
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: ARCA_BIG,
                lineHeight: 1,
                color: "var(--color-ink)",
                transformOrigin: "center",
              }}
            >
              ARCA
            </motion.span>

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="load"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="h-px w-52 overflow-hidden" style={{ background: "var(--color-border)" }}>
                    <motion.div
                      initial={{ x: "-100%" }}
                      animate={{ x: "0%" }}
                      transition={{ delay: 0.45, duration: 1.45, ease: [0.4, 0, 0.2, 1] }}
                      className="h-full w-full"
                      style={{ background: "var(--color-ink)" }}
                    />
                  </div>
                  <span className="font-mono-x text-[10px] uppercase tracking-[0.26em]" style={{ color: "var(--color-ink-3)" }}>
                    user-owned memory · on 0G
                  </span>
                </motion.div>
              ) : (
                <ConsentChoice key="choose" onFinish={finish} />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const pill = { borderRadius: 9999 } as const;

function ConsentChoice({ onFinish }: { onFinish: (c: ConsentCategories) => void }) {
  const [local, setLocal] = useState<ConsentCategories>({ preferences: true, analytics: false });
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="flex w-full flex-col items-center gap-6"
    >
      <p className="font-mono-x text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--color-ink-3)" }}>
        user-owned memory · on 0G
      </p>

      <div
        className="w-full max-w-[400px] p-5 text-left sm:p-6"
        style={{
          borderRadius: 18,
          border: "1px solid var(--color-border)",
          background: "color-mix(in oklab, var(--color-paper) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <p className="font-mono-x text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-2)" }}>
          cookies &amp; privacy
        </p>

        <div className="mt-3 divide-y" style={{ borderColor: "var(--color-border)" }}>
          <Row title="Essential" desc="Wallet sign-in & your session." locked on />
          <Row
            title="Preferences"
            desc="Remembers theme & ambient sound."
            on={local.preferences}
            onToggle={() => setLocal((s) => ({ ...s, preferences: !s.preferences }))}
          />
          <Row
            title="Analytics"
            desc="Anonymous usage. None wired up yet."
            on={local.analytics}
            onToggle={() => setLocal((s) => ({ ...s, analytics: !s.analytics }))}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onFinish({ preferences: false, analytics: false })}
            className="py-2.5 font-mono-x text-[12px] transition-opacity duration-200 hover:opacity-75"
            style={{ ...pill, background: "transparent", border: "1px solid var(--color-border-strong)", color: "var(--color-ink-2)" }}
          >
            essential only
          </button>
          <button
            onClick={() => onFinish({ preferences: true, analytics: true })}
            className="whitespace-nowrap py-2.5 font-mono-x text-[12px] transition-opacity duration-200 hover:opacity-90"
            style={{ ...pill, background: "var(--color-ink)", color: "var(--color-cream)", border: "1px solid var(--color-ink)" }}
          >
            accept all
          </button>
        </div>
        <button
          onClick={() => onFinish(local)}
          className="mt-3 w-full text-center font-mono-x text-[11px] transition-opacity duration-200 hover:opacity-70"
          style={{ background: "transparent", border: "none", color: "var(--color-ink-3)" }}
        >
          save my choices &amp; enter →
        </button>
      </div>
    </motion.div>
  );
}

function Row({
  title,
  desc,
  on,
  onToggle,
  locked,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle?: () => void;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-mono-x text-[12px] uppercase tracking-[0.1em]" style={{ color: "var(--color-ink)" }}>
          {title}
        </p>
        <p className="mt-1 font-mono-x text-[10.5px] leading-[1.5]" style={{ color: "var(--color-ink-3)" }}>
          {desc}
        </p>
      </div>
      {locked ? (
        <span className="shrink-0 font-mono-x text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-3)" }}>
          on
        </span>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={on}
          className="relative inline-block shrink-0 transition-colors duration-200"
          style={{
            width: 40,
            height: 22,
            padding: 0,
            border: "none",
            borderRadius: 9999,
            background: on ? "var(--color-accent)" : "var(--color-border-strong)",
          }}
        >
          <span
            className="absolute bg-white transition-transform duration-200"
            style={{ top: 3, left: 3, width: 16, height: 16, borderRadius: 9999, transform: on ? "translateX(18px)" : "translateX(0)" }}
          />
        </button>
      )}
    </div>
  );
}
