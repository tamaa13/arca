"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

// pieterkoopt-style scroll-reactive card: it tilts in 3D based on its position in
// the viewport (scrubbing as you scroll), like the fanning cards on the reference.
// rAF-driven so it works under Lenis.
export function ScrollTilt({
  children,
  intensity = 10,
  className,
}: {
  children: ReactNode;
  intensity?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const rxs = useSpring(rx, { stiffness: 90, damping: 24, mass: 0.5 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const center = rect.top + rect.height / 2;
        const p = (center - vh / 2) / (vh / 2 + rect.height / 2); // -1 (top) .. 1 (bottom)
        rx.set(p * intensity);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rx, intensity]);

  return (
    <div className={className} style={{ perspective: 1100 }}>
      <motion.div style={{ rotateX: rxs, transformStyle: "preserve-3d" }} className="h-full">
        {children}
      </motion.div>
    </div>
  );
}
