import type { StatusMessage } from "@/lib/types";

// The `.status` line under each step (ok = green, err = warn red).
export function StatusLine({ status }: { status: StatusMessage }) {
  const cls = "status" + (status.kind ? " " + status.kind : "");
  return <div className={cls}>{status.text}</div>;
}
