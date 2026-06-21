"use client";

import { PLATFORMS, type Platform } from "@/lib/constants";
import { platformLabel } from "@/lib/snippets";

interface ConnectorTabsProps {
  active: Platform;
  onSelect: (p: Platform) => void;
}

export function ConnectorTabs({ active, onSelect }: ConnectorTabsProps) {
  return (
    <div className="tabs">
      {PLATFORMS.map((id) => (
        <button
          key={id}
          type="button"
          className={id === active ? "active" : ""}
          onClick={() => onSelect(id)}
        >
          {platformLabel(id)}
        </button>
      ))}
    </div>
  );
}
