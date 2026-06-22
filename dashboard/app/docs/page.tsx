import type { Metadata } from "next";
import { Navbar } from "@/components/organisms/Navbar";
import { DocsNav } from "@/components/docs/DocsNav";

export const metadata: Metadata = {
  title: "Arca — docs",
  description: "How Arca works: user-owned, cross-agent AI memory encrypted to your wallet and stored on 0G.",
};

const SECTIONS = [
  { id: "what", label: "What is Arca" },
  { id: "how", label: "How it works" },
  { id: "connect", label: "Connect agents" },
  { id: "security", label: "Security model" },
  { id: "revoke", label: "Revoke" },
  { id: "contracts", label: "Contracts" },
  { id: "faq", label: "FAQ" },
];

const MAINNET_EXPLORER = "https://chainscan.0g.ai";
const TESTNET_EXPLORER = "https://chainscan-galileo.0g.ai";

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 pt-28 pb-24 sm:px-8">
        <header className="mb-12">
          <p className="font-mono-x text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">documentation</p>
          <h1 className="font-display mt-3 text-[clamp(34px,4.4vw,56px)] leading-[1.04] tracking-[-0.015em] text-[var(--color-ink)]">
            Arca docs
          </h1>
          <p className="mt-3 max-w-[60ch] text-[14px] leading-[1.6] text-[var(--color-ink-2)]">
            User-owned, cross-agent AI memory — encrypted to your wallet and stored on 0G.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[170px_1fr]">
          <DocsNav sections={SECTIONS} />

          <div className="min-w-0 max-w-[68ch]">
            <Section id="what" title="What is Arca">
              <P>
                Arca is a memory layer for AI agents. Connect any agent — a CLI, a web chat, an IDE, any MCP
                client — and they all read and write the <Em>same</Em> memory. That memory is encrypted to
                your wallet and stored on 0G, so it&apos;s yours: portable across apps, recoverable with your
                wallet, and revocable per agent.
              </P>
              <P>
                Unlike memory baked into one app, Arca isn&apos;t locked to a vendor. Save a fact in your
                terminal today, recall it from your browser tomorrow.
              </P>
            </Section>

            <Section id="how" title="How it works">
              <Ol>
                <li>
                  <Em>Connect your wallet.</Em> You sign a one-time message (EIP-712). Arca derives your
                  encryption key from that signature with HKDF-SHA256 — it never sees your private key.
                </li>
                <li>
                  <Em>Fund a little storage.</Em> A small 0G deposit lets your agents write under your wallet
                  without you signing every save (~0.1 0G ≈ 200 saves).
                </li>
                <li>
                  <Em>Connect agents.</Em> Each agent connects with its own credential — sign-in or a token.
                </li>
                <li>
                  <Em>Save &amp; recall.</Em> On save, your memory is encrypted (AES-256-GCM), stored on 0G
                  Storage, and its root anchored in the Arca registry on 0G Chain. On recall, the agent fetches
                  the ciphertext from 0G and decrypts it with your key.
                </li>
              </Ol>
            </Section>

            <Section id="connect" title="Connect your agents">
              <P>Two ways, depending on the client:</P>
              <Ul>
                <li>
                  <Em>Sign-in</Em> — Claude Code and web apps (Claude.ai, ChatGPT) connect by signing in. No
                  token to paste.
                </li>
                <li>
                  <Em>Token</Em> — Cursor, opencode, Codex, Antigravity, and raw MCP clients paste a per-agent
                  token.
                </li>
              </Ul>
              <P>Each connection is independent — see Revoke.</P>
            </Section>

            <Section id="security" title="Security model">
              <Ul>
                <li>
                  <Em>Your key, not your private key.</Em> Arca never sees your private key; it derives your
                  encryption key from a signature you produce in your wallet, and never stores it at rest.
                </li>
                <li>
                  <Em>Ciphertext at rest.</Em> Your memory is stored on 0G as AES-256-GCM ciphertext — openable
                  only with your wallet-derived key.
                </li>
                <li>
                  <Em>Ownership on-chain.</Em> The registry on 0G Chain maps your memory roots to your wallet,
                  so you can always recover your memory with your wallet alone.
                </li>
                <li>
                  <Em>Granular revoke.</Em> Each agent has its own credential; revoke one without touching the
                  others.
                </li>
                <li>
                  <Em>Today vs. next — stated plainly.</Em> Today the MCP runs on a server that derives your key
                  in memory while you&apos;re connected, so the operator could in principle read it during a
                  live session. We do <Em>not</Em> claim operator-blindness yet. Next: run the MCP inside a 0G
                  TEE (sealed enclave) so the operator can&apos;t read your key or memory even live — proven
                  feasible on testnet (sealed-container PoC), but <Em>not live yet</Em>.
                </li>
              </Ul>
            </Section>

            <Section id="revoke" title="Revoke">
              <P>
                Every agent connects with its own credential, stored hashed. Revoke one from your dashboard and
                that agent loses access immediately, while your other agents keep working. If a device or agent
                is compromised, you cut just that one — not your whole memory.
              </P>
            </Section>

            <Section id="contracts" title="Contracts">
              <P>
                Arca&apos;s registry on 0G Chain maps your encrypted-memory roots to your wallet, so you
                recover with your wallet alone. The app uses the <Em>v2 owner-mapping</Em> registry — a
                wallet-authorized delegate anchors your saves, so you don&apos;t sign every write.{" "}
                <Em>v1</Em> is the original self-anchor version. All addresses are public.
              </P>

              <ContractGroup
                title="Registry v2 · owner-mapping (used by the app)"
                rows={[
                  { net: "0G Aristotle · mainnet (16661)", addr: "0xbf9751705b347fe21A5171Ebf2b0d00e1D91a540", explorer: MAINNET_EXPLORER },
                  { net: "0G Galileo · testnet (16602)", addr: "0xc196C28886c93462f55A78134b5bF6118A3f5860", explorer: TESTNET_EXPLORER },
                ]}
              />
              <ContractGroup
                title="Registry v1 · self-anchor"
                rows={[
                  { net: "0G Aristotle · mainnet (16661)", addr: "0x746Cb7B6eC8521262b01E2788188fC475f95216e", explorer: MAINNET_EXPLORER },
                  { net: "0G Galileo · testnet (16602)", addr: "0xCcFbEdd5E10051399CA2B6ea1fDF1B62126d4ECD", explorer: TESTNET_EXPLORER },
                ]}
              />

              <P>
                <span className="font-mono-x text-[12px] text-[var(--color-ink-3)]">
                  The live app currently runs on 0G Galileo testnet. Mainnet contracts are deployed + proven.
                </span>
              </P>
            </Section>

            <Section id="faq" title="FAQ">
              <Q q="Where does my memory live?">
                Encrypted on 0G Storage; ownership on 0G Chain. Not in an Arca database.
              </Q>
              <Q q="Can Arca read my memory?">
                At rest, no — it&apos;s ciphertext. During a live session today the server derives your key in
                memory; the 0G TEE (coming) closes that gap.
              </Q>
              <Q q="What if the server goes away?">
                Your memory is on 0G, recoverable with your wallet alone.
              </Q>
              <Q q="Which agents work?">
                Any MCP client. Claude Code and opencode are verified live; others work by spec.
              </Q>
            </Section>
          </div>
        </div>
      </main>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <h2 className="font-display text-[26px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[14px] leading-[1.7] text-[var(--color-ink-2)]">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}
function Em({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[var(--color-ink)]">{children}</strong>;
}
function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-[var(--color-ink-3)]">{children}</ul>;
}
function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-5 marker:text-[var(--color-ink-3)]">{children}</ol>;
}
function ContractGroup({ title, rows }: { title: string; rows: { net: string; addr: string; explorer: string }[] }) {
  return (
    <div className="mt-3">
      <p className="font-mono-x text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-2)]">{title}</p>
      <div className="mt-1.5 rounded-xl border border-[var(--color-border)] px-4">
        {rows.map((r) => (
          <div
            key={r.addr}
            className="flex flex-col gap-1 border-t border-[var(--color-border)] py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="font-mono-x text-[11px] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">{r.net}</span>
            <a
              href={`${r.explorer}/address/${r.addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-mono-x text-[12px] text-[var(--color-ink)] underline decoration-[var(--color-border-strong)] underline-offset-2 transition-colors hover:decoration-[var(--color-ink)]"
            >
              {r.addr}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--color-border)] pt-3">
      <p className="font-semibold text-[var(--color-ink)]">{q}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
