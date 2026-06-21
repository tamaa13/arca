"use client";

import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "solid" | "ghost";
}

export function Button({ variant = "solid", className = "", ...props }: ButtonProps) {
  const cls = [variant === "ghost" ? "ghost" : "", className].filter(Boolean).join(" ");
  return <button className={cls} {...props} />;
}
