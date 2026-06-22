import type { Metadata } from "next";
import { Navbar } from "@/components/organisms/Navbar";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export const metadata: Metadata = {
  title: "Arca — docs",
  description: "How Arca works: user-owned, cross-agent AI memory encrypted to your wallet and stored on 0G.",
};

const NAV = [
  { label: "Get started", items: [{ id: "intro", label: "Introduction" }, { id: "quickstart", label: "Quickstart" }] },
  {
    label: "Concepts",
    items: [
      { id: "how", label: "How it works" },
      { id: "security", label: "Security model" },
      { id: "revoke", label: "Revoke" },
    ],
  },
  { label: "Connect", items: [{ id: "connect", label: "Connect agents" }] },
  { label: "Reference", items: [{ id: "contracts", label: "Contracts" }, { id: "faq", label: "FAQ" }] },
];

const MAINNET_EXPLORER = "https://chainscan.0g.ai";
const TESTNET_EXPLORER = "https://chainscan-galileo.0g.ai";

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto w-full max-w-[var(--container-wrap)] px-6 pt-28 pb-24 sm:px-8">
        <div className="grid gap-x-10 lg:grid-cols-[180px_1fr]">
          <DocsSidebar groups={NAV} />

          <div className="min-w-0">
            <div className="mb-4">
              <p className="font-mono-x text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">documentation</p>
              <h1 className="font-display mt-4 text-[clamp(38px,5vw,68px)] leading-[1.02] tracking-[-0.02em] text-[var(--color-ink)]">
                User-owned memory on 0G.
              </h1>
              <p className="mt-5 max-w-[56ch] text-[15px] leading-[1.6] text-[var(--color-ink-2)]">
                One memory for every agent — a CLI, a web chat, an IDE, any MCP client. It&apos;s encrypted to
                your wallet and stored on 0G, so it&apos;s portable across apps and recoverable with your wallet
                alone. The chapters below walk the model, the security, and the on-chain reference.
              </p>
            </div>

            <Chapter n="01" label="Get started.">
              <Doc id="intro" title="Introduction">
                <P>
                  Arca is a memory layer for AI agents. Connect any agent and they all read and write the{" "}
                  <Em>same</Em> memory — save a fact in your terminal, recall it from your browser. That memory
                  is encrypted to your wallet and stored on 0G: portable across apps, recoverable with your
                  wallet, and revocable per agent.
                </P>
                <P>
                  Unlike memory baked into one app, Arca isn&apos;t locked to a vendor — it&apos;s yours, on a
                  decentralized stack you control.
                </P>
              </Doc>
              <Doc id="quickstart" title="Quickstart">
                <Ol>
                  <li>
                    <Em>Connect your wallet</Em> and sign once — Arca derives your encryption key from that
                    signature.
                  </li>
                  <li>
                    <Em>Fund a little storage</Em> — a small 0G deposit lets agents write under your wallet
                    (~0.1 0G ≈ 200 saves).
                  </li>
                  <li>
                    <Em>Connect your agents</Em> — each with its own credential (sign-in or a token).
                  </li>
                  <li>
                    <Em>Save &amp; recall</Em> from anywhere — one shared memory across every agent.
                  </li>
                </Ol>
              </Doc>
            </Chapter>

            <Chapter n="02" label="Concepts.">
              <Doc id="how" title="How it works">
                <Ol>
                  <li>
                    <Em>Sign once (EIP-712).</Em> Arca derives your encryption key from the signature with
                    HKDF-SHA256 — it never sees your private key.
                  </li>
                  <li>
                    <Em>Fund storage.</Em> A small 0G deposit lets your agents write under your wallet without
                    you signing every save.
                  </li>
                  <li>
                    <Em>Save.</Em> Your memory is encrypted (AES-256-GCM), stored on 0G Storage, and its root
                    anchored in the Arca registry on 0G Chain.
                  </li>
                  <li>
                    <Em>Recall.</Em> Any agent fetches the ciphertext from 0G and decrypts it with your
                    wallet-derived key.
                  </li>
                </Ol>
              </Doc>
              <Doc id="security" title="Security model">
                <Ul>
                  <li>
                    <Em>Your key, not your private key.</Em> Arca never sees your private key; it derives your
                    encryption key from a signature you produce in your wallet, and never stores it at rest.
                  </li>
                  <li>
                    <Em>Ciphertext at rest.</Em> Memory is stored on 0G as AES-256-GCM ciphertext — openable
                    only with your wallet-derived key.
                  </li>
                  <li>
                    <Em>Ownership on-chain.</Em> The registry on 0G Chain maps your memory roots to your wallet,
                    so you recover your memory with your wallet alone.
                  </li>
                  <li>
                    <Em>Today vs. next — stated plainly.</Em> Today the MCP runs on a server that derives your
                    key in memory while you&apos;re connected, so the operator could in principle read it during
                    a live session. We do <Em>not</Em> claim operator-blindness yet. Next: run the MCP inside a
                    0G TEE (sealed enclave) so the operator can&apos;t read your key or memory even live — proven
                    feasible on testnet (sealed-container PoC), but <Em>not live yet</Em>.
                  </li>
                </Ul>
              </Doc>
              <Doc id="revoke" title="Revoke">
                <P>
                  Every agent connects with its own credential, stored hashed. Revoke one from your dashboard
                  and that agent loses access immediately, while your other agents keep working. If a device or
                  agent is compromised, you cut just that one — not your whole memory.
                </P>
              </Doc>
            </Chapter>

            <Chapter n="03" label="Connect.">
              <Doc id="connect" title="Connect your agents">
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
                <P>
                  Each connection is independent — see Revoke. Verified live end-to-end so far:{" "}
                  <Em>Claude Code</Em> and <Em>opencode</Em>; others work by spec.
                </P>
              </Doc>
            </Chapter>

            <Chapter n="04" label="Reference.">
              <Doc id="contracts" title="Contracts">
                <P>
                  Arca&apos;s registry on 0G Chain maps your encrypted-memory roots to your wallet. The app uses
                  the <Em>v2 owner-mapping</Em> registry — a wallet-authorized delegate anchors your saves, so
                  you don&apos;t sign every write. <Em>v1</Em> is the original self-anchor version. All public.
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
              </Doc>
              <Doc id="faq" title="FAQ">
                <Q q="Where does my memory live?">
                  Encrypted on 0G Storage; ownership on 0G Chain. Not in an Arca database.
                </Q>
                <Q q="Can Arca read my memory?">
                  At rest, no — it&apos;s ciphertext. During a live session today the server derives your key in
                  memory; the 0G TEE (next) closes that gap.
                </Q>
                <Q q="What if the server goes away?">
                  Your memory is on 0G, recoverable with your wallet alone.
                </Q>
                <Q q="Which agents work?">
                  Any MCP client. Claude Code and opencode are verified live; others work by spec.
                </Q>
              </Doc>
            </Chapter>
          </div>
        </div>
      </main>
    </>
  );
}

// ── chapter / section primitives (anima-style: serif-italic chapter label left, subsections right) ──
function Chapter({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-8 gap-y-7 border-t border-[var(--color-border)] py-12 sm:grid-cols-[150px_1fr] sm:py-16">
      <div className="sm:sticky sm:top-28 sm:self-start">
        <p className="font-mono-x text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">Chapter {n}</p>
        <p className="font-display mt-2 text-[clamp(24px,2.6vw,34px)] italic leading-[1.05] text-[var(--color-ink)]">
          {label}
        </p>
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="max-w-[64ch] scroll-mt-28 border-t border-[var(--color-border)] py-8 first:border-t-0 first:pt-0">
      <h2 className="font-display text-[24px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">{title}</h2>
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
