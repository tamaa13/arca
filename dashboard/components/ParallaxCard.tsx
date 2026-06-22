"use client";

import { motion, useSpring } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

const SPRING = { stiffness: 110, damping: 26, mass: 0.5 } as const;

// pieterkoopt-style interactive parallax card. Three layered motions, all rAF-driven
// so they survive Lenis (which swallows native scroll, killing framer's useScroll):
//   1. scroll parallax  — vertical travel that scales with `index` so a grid of cards
//      fans/layers instead of moving in lockstep,
//   2. scroll 3D-tilt   — rotateX that flips sign per card (alternating fan),
//   3. mouse 3D-tilt    — the card leans toward the cursor on hover, then eases back.
export function ParallaxCard({
  children,
  index = 0,
  className,
  travel = 18,
  tilt = 5,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  travel?: number;
  tilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0, active: false });
  const rx = useSpring(0, SPRING);
  const ry = useSpring(0, SPRING);
  const ty = useSpring(0, SPRING);
  const phase = index % 2 === 0 ? 1 : -1;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const center = rect.top + rect.height / 2;
        const p = (center - vh / 2) / (vh / 2 + rect.height / 2); // -1 (entering) .. 1 (leaving)
        const m = mouse.current;
        rx.set(p * tilt * phase + (m.active ? -m.y * 9 : 0));
        ry.set(m.active ? m.x * 11 : 0);
        ty.set(-p * (travel + index * 6));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rx, ry, ty, index, phase, travel, tilt]);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mouse.current = {
      x: (e.clientX - r.left) / r.width - 0.5,
      y: (e.clientY - r.top) / r.height - 0.5,
      active: true,
    };
  };
  const onLeave = () => {
    mouse.current = { x: 0, y: 0, active: false };
  };

  return (
    <div className={className} style={{ perspective: 1000 }}>
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, y: ty, transformStyle: "preserve-3d" }}
        className="h-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
