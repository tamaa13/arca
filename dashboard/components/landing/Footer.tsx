import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-[var(--container-wrap)] flex-col gap-2 px-6 py-10 font-mono-x text-[11px] text-[var(--color-ink-3)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <span>arca · user-owned memory on 0G</span>
      <span className="flex gap-5">
        <Link href="/app" className="transition-colors hover:text-[var(--color-ink)]">app</Link>
        <Link href="/docs" className="transition-colors hover:text-[var(--color-ink)]">docs</Link>
        <span>0G Galileo · testnet</span>
      </span>
    </footer>
  );
}
