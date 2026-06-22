import type { ReactNode } from "react";
import { StepBadge } from "@/components/atoms/StepBadge";
import { zeroG } from "@/components/atoms/ZeroG";

interface StepCardProps {
  n: number;
  title: string;
  description: string;
  on?: boolean;
  done?: boolean;
  children?: ReactNode;
}

// A bordered step card: opacity .5 → 1 when `on`, stronger border when `done`.
// Step 1 in the legacy markup is `on` by default.
export function StepCard({ n, title, description, on = false, done = false, children }: StepCardProps) {
  const cls = ["step", on ? "on" : "", done ? "done" : ""].filter(Boolean).join(" ");
  return (
    <section className={cls}>
      <h2>
        <StepBadge n={n} /> {title}
      </h2>
      <p>{zeroG(description)}</p>
      {children}
    </section>
  );
}
