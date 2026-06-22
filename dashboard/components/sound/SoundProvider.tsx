"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type SoundCtx = { soundOn: boolean; setSoundOn: (v: boolean) => void; toggle: () => void };
const Ctx = createContext<SoundCtx | null>(null);

const KEY = "arca-sound";

// Ambient audio that survives client-side (Link) navigation because the layout —
// and therefore this provider + its <audio> — never unmounts on route change.
export function SoundProvider({ children }: { children: ReactNode }) {
  const [soundOn, setSoundOnState] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Restore preference (autoplay still needs a user gesture; the intro's Enter provides it).
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(KEY) === "on") setSoundOnState(true);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (soundOn) {
      a.volume = 0.3;
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [soundOn]);

  const setSoundOn = useCallback((v: boolean) => {
    setSoundOnState(v);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, v ? "on" : "off");
  }, []);
  const toggle = useCallback(() => setSoundOn(!soundOn), [setSoundOn, soundOn]);

  return (
    <Ctx.Provider value={{ soundOn, setSoundOn, toggle }}>
      <audio ref={audioRef} src="/audio/ambient.mp3" loop preload="none" aria-hidden />
      {children}
    </Ctx.Provider>
  );
}

export function useSound() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSound must be used within SoundProvider");
  return c;
}
