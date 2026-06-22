"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EASE } from "@/lib/motion";

// ── Real cookie consent ────────────────────────────────────────────────────
// Three categories. ESSENTIAL is always on (wallet sign-in/session, the entered
// flag, this consent record itself — the app can't work without them). PREFERENCES
// (theme + ambient-sound persistence) and ANALYTICS are opt-in and actually RESPECTED:
// providers check `allow()` before writing their cookie, and revoking preferences
// clears the keys we set. Persisted in localStorage so the choice sticks, re-openable
// any time from the footer.
const KEY = "arca-consent-v1";
const PREFERENCE_KEYS = ["arca-sound", "arca-theme"]; // cleared when preferences are revoked

export type ConsentCategories = { preferences: boolean; analytics: boolean };
export type ConsentCategory = "essential" | "preferences" | "analytics";

type ConsentValue = {
  decided: boolean;
  prefs: ConsentCategories;
  allow: (c: ConsentCategory) => boolean;
  save: (c: ConsentCategories) => void;
  acceptAll: () => void;
  essentialOnly: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
};

const Ctx = createContext<ConsentValue | null>(null);

export function useConsent() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsent must be used within ConsentProvider");
  return c;
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [decided, setDecided] = useState(false);
  const [prefs, setPrefs] = useState<ConsentCategories>({ preferences: false, analytics: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<ConsentCategories>;
        setPrefs({ preferences: !!p.preferences, analytics: !!p.analytics });
        setDecided(true);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const save = useCallback((c: ConsentCategories) => {
    setPrefs(c);
    setDecided(true);
    setSettingsOpen(false);
    try {
      localStorage.setItem(KEY, JSON.stringify({ preferences: c.preferences, analytics: c.analytics, v: 1 }));
      // Revoking preferences must actually forget what we remembered.
      if (!c.preferences) for (const k of PREFERENCE_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ConsentValue>(
    () => ({
      decided,
      prefs,
      allow: (cat) => (cat === "essential" ? true : prefs[cat]),
      save,
      acceptAll: () => save({ preferences: true, analytics: true }),
      essentialOnly: () => save({ preferences: false, analytics: false }),
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
    }),
    [decided, prefs, settingsOpen, save],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {hydrated ? (
        <>
          <ConsentBanner />
          <ConsentModal />
        </>
      ) : null}
    </Ctx.Provider>
  );
}

// Robust switch (padding:0 + explicit geometry so the global `button{padding}` can't shift the knob).
function Switch({ on, onClick, disabled }: { on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="relative inline-block shrink-0 transition-colors duration-200"
      style={{
        width: 40,
        height: 22,
        padding: 0,
        border: "none",
        borderRadius: 9999,
        background: on ? "var(--color-accent)" : "var(--color-border-strong)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span
        className="absolute bg-white transition-transform duration-200"
        style={{ top: 3, left: 3, width: 16, height: 16, borderRadius: 9999, transform: on ? "translateX(18px)" : "translateX(0)" }}
      />
    </button>
  );
}

function CategoryRow({
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
    <div className="flex items-start justify-between gap-5 py-3.5">
      <div>
        <p className="font-mono-x text-[12px] uppercase tracking-[0.1em]" style={{ color: "var(--color-ink)" }}>
          {title}
        </p>
        <p className="mt-1 max-w-[44ch] font-mono-x text-[11px] leading-[1.55]" style={{ color: "var(--color-ink-3)" }}>
          {desc}
        </p>
      </div>
      {locked ? (
        <span className="mt-1 shrink-0 font-mono-x text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-3)" }}>
          always on
        </span>
      ) : (
        <span className="mt-0.5">
          <Switch on={on} onClick={onToggle} />
        </span>
      )}
    </div>
  );
}

const pill = { borderRadius: 9999 } as const;

function ConsentModal() {
  const { settingsOpen, closeSettings, prefs, save } = useConsent();
  const [local, setLocal] = useState<ConsentCategories>(prefs);
  useEffect(() => {
    if (settingsOpen) setLocal(prefs);
  }, [settingsOpen, prefs]);

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="fixed inset-0 z-[110] flex items-center justify-center px-5"
          style={{ background: "rgb(var(--rgb-ink) / 0.42)", backdropFilter: "blur(3px)" }}
          onClick={closeSettings}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] p-6 sm:p-7"
            style={{
              borderRadius: 20,
              border: "1px solid var(--color-border)",
              background: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
              backdropFilter: "blur(10px)",
              boxShadow: "var(--shadow-doc)",
            }}
          >
            <p className="font-display text-[22px] leading-tight" style={{ color: "var(--color-ink)" }}>
              Cookie preferences
            </p>
            <p className="mt-2 font-mono-x text-[11px] leading-[1.6]" style={{ color: "var(--color-ink-3)" }}>
              Choose what Arca may store on this device. Essential is required; the rest are yours to control.
            </p>

            <div className="mt-4 divide-y" style={{ borderColor: "var(--color-border)" }}>
              <CategoryRow
                locked
                on
                title="Essential"
                desc="Wallet sign-in, your session, and this consent record. The app can't run without them."
              />
              <CategoryRow
                title="Preferences"
                desc="Remembers your theme and ambient-sound choice across visits."
                on={local.preferences}
                onToggle={() => setLocal((s) => ({ ...s, preferences: !s.preferences }))}
              />
              <CategoryRow
                title="Analytics"
                desc="Anonymous usage to improve Arca. Off by default — none is wired up today; the switch will gate it when it is."
                on={local.analytics}
                onToggle={() => setLocal((s) => ({ ...s, analytics: !s.analytics }))}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => save(local)}
                className="py-2.5 font-mono-x text-[12px] transition-opacity duration-200 hover:opacity-75"
                style={{ ...pill, background: "transparent", border: "1px solid var(--color-border-strong)", color: "var(--color-ink-2)" }}
              >
                save choices
              </button>
              <button
                onClick={() => save({ preferences: true, analytics: true })}
                className="py-2.5 font-mono-x text-[12px] transition-opacity duration-200 hover:opacity-90"
                style={{ ...pill, background: "var(--color-ink)", color: "var(--color-cream)", border: "1px solid var(--color-ink)" }}
              >
                accept all
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConsentBanner() {
  const { decided, settingsOpen, acceptAll, essentialOnly, openSettings } = useConsent();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const onLanding = path === "/" || path === "/index.html";
    const isOAuth = window.location.search.includes("client_id");
    // Don't double up where the landing intro already asks, and never cover the
    // OAuth /authorize consent screen with our cookie banner.
    const introWillShow = onLanding && localStorage.getItem("arca-entered") !== "1" && !isOAuth;
    setArmed(!introWillShow && !isOAuth);
  }, []);

  const show = armed && !decided && !settingsOpen;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div
            className="mx-auto flex max-w-[var(--container-wrap)] flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            style={{
              borderRadius: 16,
              border: "1px solid var(--color-border)",
              background: "color-mix(in oklab, var(--color-paper) 88%, transparent)",
              backdropFilter: "blur(10px)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <p className="max-w-[58ch] font-mono-x text-[11px] leading-[1.6]" style={{ color: "var(--color-ink-2)" }}>
              We use cookies — essential ones for your wallet session, plus optional preferences &amp; anonymous
              analytics. You&apos;re in control.
            </p>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                onClick={openSettings}
                className="px-4 py-2 font-mono-x text-[11px] transition-opacity duration-200 hover:opacity-75"
                style={{ ...pill, background: "transparent", border: "1px solid var(--color-border-strong)", color: "var(--color-ink-2)" }}
              >
                manage
              </button>
              <button
                onClick={essentialOnly}
                className="px-4 py-2 font-mono-x text-[11px] transition-opacity duration-200 hover:opacity-75"
                style={{ ...pill, background: "transparent", border: "1px solid var(--color-border-strong)", color: "var(--color-ink-2)" }}
              >
                essential only
              </button>
              <button
                onClick={acceptAll}
                className="whitespace-nowrap px-4 py-2 font-mono-x text-[11px] transition-opacity duration-200 hover:opacity-90"
                style={{ ...pill, background: "var(--color-ink)", color: "var(--color-cream)", border: "1px solid var(--color-ink)" }}
              >
                accept all
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
