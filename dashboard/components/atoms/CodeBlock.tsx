"use client";

import { useState } from "react";

interface CodeBlockProps {
  code: string;
  copyable?: boolean;
}

// A <pre> block with the optional floating "copy" button (top-right), matching the
// legacy connector snippet box.
export function CodeBlock({ code, copyable = false }: CodeBlockProps) {
  const [label, setLabel] = useState("copy");

  const onCopy = () => {
    navigator.clipboard?.writeText(code);
    setLabel("copied");
    setTimeout(() => setLabel("copy"), 1200);
  };

  if (!copyable) return <pre>{code}</pre>;

  return (
    <div style={{ position: "relative" }}>
      <pre>{code}</pre>
      <button
        type="button"
        className="copy"
        onClick={onCopy}
        style={{ position: "absolute", top: 10, right: 10 }}
      >
        {label}
      </button>
    </div>
  );
}
