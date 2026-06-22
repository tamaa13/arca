"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSound } from "@/components/sound/SoundProvider";
import { EASE } from "@/lib/motion";

const SOFT = [0.16, 1, 0.3, 1] as const; // expressive ease-out for the zoom + settle
const ARCA_BIG = 86; // loading hero size (px); the scale-in makes it fill the screen
const ARCA_REST = 34; // size once it settles into the choose panel

// First-visit intro: ARCA zooms in from full-screen, then SHRINKS in place into a panel
// to accept/decline cookies + opt into ambient sound (once per browser). Skipped for OAuth.
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
    const t = setTimeout(() => setPhase("choose"), 2000);
    return () => clearTimeout(t);
  }, []);

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
    // Lenis is created by MotionProvider (a parent → its effect runs after this one),
    // so stop it now and again next frame once it exists.
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

  const enter = (cookies: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("arca-entered", "1");
      window.localStorage.setItem("arca-cookies", cookies ? "accepted" : "declined");
    }
    setSoundOn(soundChoice); // this click is the user gesture that lets audio start
    setPhase("done");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          // Same ambient wash as the landing → matches 1:1 in light + dark, no muddy tint.
          className="ambient-wash fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-6"
        >
          <div className="relative flex w-full max-w-[460px] flex-col items-center gap-7 text-center">
            {/* One ARCA the whole time — zooms in, then settles smaller into the panel. */}
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
                <Choose
                  key="choose"
                  soundChoice={soundChoice}
                  setSoundChoice={setSoundChoice}
                  onEnter={enter}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
  // borderRadius is set inline because the global unlayered `button { border-radius: 0 }`
  // would otherwise square these off (it beats Tailwind's rounded-full utility).
  const pill = { borderRadius: 9999 } as const;
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

      {/* One consent card: sound row → note → decline / accept side by side. */}
      <div
        className="w-full max-w-[384px] p-5 text-left sm:p-6"
        style={{
          borderRadius: 18,
          border: "1px solid var(--color-border)",
          background: "color-mix(in oklab, var(--color-paper) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono-x text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-2)" }}>
            ambient sound
          </span>
          <button
            onClick={() => setSoundChoice(!soundChoice)}
            aria-pressed={soundChoice}
            aria-label="Toggle ambient sound"
            className="relative inline-block shrink-0 transition-colors duration-200"
            // padding:0 + explicit geometry so the global `button{padding:12px 22px}` can't
            // shove the absolute knob past the track edge.
            style={{
              width: 40,
              height: 22,
              padding: 0,
              border: "none",
              borderRadius: 9999,
              background: soundChoice ? "var(--color-accent)" : "var(--color-border-strong)",
            }}
          >
            <span
              className="absolute bg-white transition-transform duration-200"
              style={{
                top: 3,
                left: 3,
                width: 16,
                height: 16,
                borderRadius: 9999,
                transform: soundChoice ? "translateX(18px)" : "translateX(0)",
              }}
            />
          </button>
        </div>

        <div className="my-4 h-px w-full" style={{ background: "var(--color-border)" }} />

        <p className="font-mono-x text-[10.5px] leading-[1.7]" style={{ color: "var(--color-ink-3)" }}>
          We use a couple of cookies for your wallet session. Ambient sound is optional — toggle it anytime
          from the navbar.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onEnter(false)}
            className="py-2.5 font-mono-x text-[12px] transition-opacity duration-200 hover:opacity-75"
            style={{ ...pill, background: "transparent", border: "1px solid var(--color-border-strong)", color: "var(--color-ink-2)" }}
          >
            decline
          </button>
          <button
            onClick={() => onEnter(true)}
            className="whitespace-nowrap py-2.5 font-mono-x text-[12px] transition-opacity duration-200 hover:opacity-90"
            style={{ ...pill, background: "var(--color-ink)", color: "var(--color-cream)", border: "1px solid var(--color-ink)" }}
          >
            accept &amp; enter
          </button>
        </div>
      </div>
    </motion.div>
  );
}
