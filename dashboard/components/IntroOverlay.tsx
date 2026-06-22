"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Logo } from "@/components/atoms/Logo";
import { useSound } from "@/components/sound/SoundProvider";
import { EASE } from "@/lib/motion";

// First-visit intro: a brief loader → a panel to accept/decline cookies and opt into
// ambient sound, then it fades away (once per browser). Skipped for OAuth consent.
export function IntroOverlay() {
  const { setSoundOn } = useSound();
  const [phase, setPhase] = useState<"init" | "loading" | "choose" | "done">("init");
  const [soundChoice, setSoundChoice] = useState(false);

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
    const t = setTimeout(() => setPhase("choose"), 1700);
    return () => clearTimeout(t);
  }, []);

  const enter = (cookies: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("arca-entered", "1");
      window.localStorage.setItem("arca-cookies", cookies ? "accepted" : "declined");
    }
    setSoundOn(soundChoice); // this click is the user gesture that lets audio start
    setPhase("done");
  };

  const visible = phase === "loading" || phase === "choose";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          style={{ background: "var(--color-cream)" }}
        >
          {phase === "loading" ? (
            <Loader />
          ) : (
            <Choose soundChoice={soundChoice} setSoundChoice={setSoundChoice} onEnter={enter} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Loader() {
  return (
    <div className="flex flex-col items-center gap-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex items-center gap-3"
        style={{ color: "var(--color-ink)" }}
      >
        <Logo />
        <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 26, letterSpacing: "0.16em" }}>ARCA</span>
      </motion.div>
      <div className="h-px w-48 overflow-hidden" style={{ background: "var(--color-border)" }}>
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
          className="h-full w-full"
          style={{ background: "var(--color-ink)" }}
        />
      </div>
      <span className="font-mono-x text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--color-ink-3)" }}>
        loading
      </span>
    </div>
  );
}

function Choose({
  soundChoice,
  setSoundChoice,
  onEnter,
}: {
  soundChoice: boolean;
  setSoundChoice: (v: boolean) => void;
  onEnter: (cookies: boolean) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="flex w-full max-w-[420px] flex-col items-center gap-7 text-center"
    >
      <div className="flex items-center gap-3" style={{ color: "var(--color-ink)" }}>
        <Logo />
        <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 28, letterSpacing: "0.16em" }}>ARCA</span>
      </div>
      <p className="font-mono-x text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-3)" }}>
        user-owned memory · on 0G
      </p>

      <button
        onClick={() => setSoundChoice(!soundChoice)}
        className="flex items-center gap-3 rounded-full px-4 py-2.5"
        style={{ border: "1px solid var(--color-border-strong)", background: "transparent", color: "var(--color-ink)" }}
      >
        <span className="font-mono-x text-[12px]">ambient sound</span>
        <span
          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
          style={{ background: soundChoice ? "var(--color-accent)" : "var(--color-border-strong)" }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: soundChoice ? "translateX(18px)" : "translateX(2px)" }}
          />
        </span>
        <span className="font-mono-x text-[11px]" style={{ color: "var(--color-ink-3)" }}>
          {soundChoice ? "on" : "off"}
        </span>
      </button>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => onEnter(true)}
          className="rounded-full px-7 py-3 font-mono-x text-[13px]"
          style={{ background: "var(--color-ink)", color: "var(--color-cream)", border: "none" }}
        >
          accept cookies &amp; enter
        </button>
        <button
          onClick={() => onEnter(false)}
          className="font-mono-x text-[11px]"
          style={{ background: "transparent", border: "none", color: "var(--color-ink-3)" }}
        >
          decline cookies &amp; enter
        </button>
      </div>

      <p className="max-w-[42ch] font-mono-x text-[10px] leading-[1.6]" style={{ color: "var(--color-ink-3)" }}>
        We use a couple of cookies for your wallet session. Ambient sound is optional — toggle it anytime
        from the navbar.
      </p>
    </motion.div>
  );
}
