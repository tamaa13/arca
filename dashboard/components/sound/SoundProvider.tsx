"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useConsent } from "@/components/consent/ConsentProvider";

type SoundCtx = {
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  toggle: () => void;
  getLevels: (n: number) => number[]; // 0..1 per bar, live from the audio
};
const Ctx = createContext<SoundCtx | null>(null);

const KEY = "arca-sound";

// Ambient audio + a Web Audio analyser so the navbar icon can react to the music.
// Survives client-side (Link) navigation because the layout never unmounts.
export function SoundProvider({ children }: { children: ReactNode }) {
  const { allow } = useConsent();
  const [soundOn, setSoundOnState] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(KEY) === "on") setSoundOnState(true);
  }, []);

  // Build the audio graph lazily on first enable (a user gesture, so AudioContext is allowed).
  const ensureGraph = useCallback(() => {
    if (ctxRef.current || !audioRef.current) return;
    try {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      /* Web Audio unavailable — icon falls back to an idle animation. */
    }
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!soundOn) {
      a.pause();
      return;
    }

    let disposed = false;
    let detach: (() => void) | null = null;

    const start = async () => {
      ensureGraph();
      try {
        await ctxRef.current?.resume();
      } catch {
        /* ignore */
      }
      a.volume = 0.3;
      try {
        await a.play();
      } catch {
        // Autoplay blocked: after a hard refresh the toggle is restored to ON from localStorage,
        // but the browser won't let audio start without a user gesture (and the AudioContext is
        // suspended). Arm the first interaction to start it, then detach.
        if (disposed) return;
        const onGesture = async () => {
          try {
            await ctxRef.current?.resume();
          } catch {
            /* ignore */
          }
          try {
            await a.play();
          } catch {
            /* ignore */
          }
          detach?.();
        };
        const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
        events.forEach((e) => window.addEventListener(e, onGesture, { once: false }));
        detach = () => {
          events.forEach((e) => window.removeEventListener(e, onGesture));
          detach = null;
        };
      }
    };
    void start();

    return () => {
      disposed = true;
      detach?.();
    };
  }, [soundOn, ensureGraph]);

  const setSoundOn = useCallback(
    (v: boolean) => {
      setSoundOnState(v);
      // Only persist the choice if the user consented to preference cookies.
      if (typeof window !== "undefined" && allow("preferences")) window.localStorage.setItem(KEY, v ? "on" : "off");
    },
    [allow],
  );
  const toggle = useCallback(() => setSoundOn(!soundOn), [setSoundOn, soundOn]);

  const getLevels = useCallback((n: number) => {
    const a = analyserRef.current;
    if (!a) return new Array(n).fill(0);
    const data = new Uint8Array(a.frequencyBinCount);
    a.getByteFrequencyData(data);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      // sample a low-mid band per bar (skip the very lowest bin), amplified for a visible bounce
      const idx = 1 + Math.floor(((i + 1) / (n + 1)) * (data.length - 2));
      out.push(Math.min(1, (data[idx] / 255) * 1.8));
    }
    return out;
  }, []);

  return (
    <Ctx.Provider value={{ soundOn, setSoundOn, toggle, getLevels }}>
      <audio ref={audioRef} src="/audio/ambient.mp3" loop preload="none" crossOrigin="anonymous" aria-hidden />
      {children}
    </Ctx.Provider>
  );
}

export function useSound() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSound must be used within SoundProvider");
  return c;
}
