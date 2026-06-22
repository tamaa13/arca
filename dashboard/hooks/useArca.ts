"use client";

// Arca wallet/session state machine — a faithful port of the legacy dashboard's
// vanilla-JS logic. On-chain state is the source of truth and is identical on every
// device (the session signer is deterministic from the wallet signature), so the UI
// is consistent wherever the user connects. localStorage caches the session token so a
// refresh on the same device skips the re-sign.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserProvider,
  JsonRpcProvider,
  JsonRpcSigner,
  Contract,
  parseEther,
  formatEther,
} from "ethers";
import { useAccount, useConnectorClient, useDisconnect, useSwitchChain } from "wagmi";
import type { Account, Chain, Client, Transport } from "viem";
import { APP_CHAIN } from "@/lib/chains";
import {
  GALILEO,
  DOMAIN,
  TYPES,
  MESSAGE,
  LS_KEY,
  REGISTRY_IS_DELEGATE_ABI,
  REGISTRY_SET_DELEGATE_ABI,
  REGISTRY_ROOT_COUNT_ABI,
  EXPLORER,
} from "@/lib/constants";
import { encryptToPubkey } from "@/lib/crypto";
import { readOAuthParams, clientLabel, type OAuthParams } from "@/lib/oauth";
import type { ConnectorListing } from "@/lib/connectors";
import type { SessionData, StatusMessage, StatusKind } from "@/lib/types";

const short = (a?: string) => (a ? a.slice(0, 8) + "…" + a.slice(-6) : "");

// wagmi (viem) client → ethers v6 signer, so the existing ethers sign/activate paths keep
// working with ANY connected wallet (injected, Coinbase, WalletConnect) on any chain.
function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client;
  const provider = new BrowserProvider(transport as never, { chainId: chain.id, name: chain.name });
  return new JsonRpcSigner(provider, account.address);
}

type StatusKey = "st1" | "st2" | "st3" | "st4";

export interface ArcaState {
  account: string | null;
  session: SessionData | null;
  // step completion
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  step4Done: boolean;
  // step enabled (active / "on")
  step2On: boolean;
  step3On: boolean;
  step4On: boolean;
  step5On: boolean;
  // button enablement
  signEnabled: boolean;
  depositEnabled: boolean; // "session ready → can activate the vault"
  // status lines
  st1: StatusMessage;
  st2: StatusMessage;
  st3: StatusMessage;
  st4: StatusMessage;
  // restore-in-progress (suppress UI flash)
  ready: boolean;
  // OAuth mode (set when served at /authorize with client_id+redirect_uri+code_challenge):
  // the sign step calls /authorize/approve and we redirect back to the web client.
  oauth: OAuthParams | null;
  oauthClient: string | null; // human label for the requesting client (host)
  oauthRedirect: string | null; // the redirect_uri?code=…&state=… to send the user back with
  // live storage tracker
  balance: string | null; // signer's remaining 0G (formatted), auto-refreshed
  saveCount: number | null; // memories anchored on-chain (rootCount)
  lowBalance: boolean;
  signerExplorerUrl: string | null;
  // connected agents (granular per-connector tokens)
  connectors: ConnectorListing[] | null; // null = not loaded yet
  newConnectorToken: string | null; // a just-minted token, shown ONCE (then null)
  connectorBusy: boolean;
  connectorStatus: StatusMessage;
}

export interface ArcaApi extends ArcaState {
  connect: () => Promise<void>;
  sign: () => Promise<void>;
  // Fund the signer + authorize it as a delegate in ONE action (two wallet popups, one step).
  // Skips whichever is already done on-chain, so it's safe to re-run / run on a restored vault.
  activate: (amount: string) => Promise<void>;
  activating: boolean;
  disconnect: () => void;
  // connected agents
  mintConnector: (label: string) => Promise<void>;
  revokeConnector: (id: string) => Promise<void>;
  dismissNewToken: () => void;
}

const blank: StatusMessage = { text: "", kind: "" };

export function useArca(): ArcaApi {
  // ethers handles live only in refs (not state) — they're not rendered.
  const providerRef = useRef<BrowserProvider | null>(null);
  const signerRef = useRef<JsonRpcSigner | null>(null);
  const readProviderRef = useRef<JsonRpcProvider | null>(null);
  const sessionRef = useRef<SessionData | null>(null);
  const accountRef = useRef<string | null>(null);

  const [account, setAccount] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [ready, setReady] = useState(false);

  // Wallet connection is owned by wagmi/RainbowKit now (any wallet, testnet/mainnet switch).
  const { address: wagmiAddress, isConnected, chainId: walletChainId } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  // OAuth mode: read the params from the URL once on mount (null = normal dashboard).
  // Read OAuth params AFTER mount (in the restore effect below), NEVER during render:
  // reading window.location during render makes the client's first paint differ from the
  // static prerender → React hydration error #418 (which can break event handlers / the
  // redirect). As state, the first render matches the prerender (null) and we switch to
  // OAuth mode post-hydration.
  const [oauth, setOauth] = useState<OAuthParams | null>(null);
  const [oauthRedirect, setOauthRedirect] = useState<string | null>(null);

  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [step3Done, setStep3Done] = useState(false);
  const [step4Done, setStep4Done] = useState(false);

  const [step2On, setStep2On] = useState(false);
  const [step3On, setStep3On] = useState(false);
  const [step4On, setStep4On] = useState(false);
  const [step5On, setStep5On] = useState(false);

  const [signEnabled, setSignEnabled] = useState(false);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [activating, setActivating] = useState(false);

  const [st1, setSt1] = useState<StatusMessage>(blank);
  const [st2, setSt2] = useState<StatusMessage>(blank);
  const [st3, setSt3] = useState<StatusMessage>(blank);
  const [st4, setSt4] = useState<StatusMessage>(blank);

  // live storage tracker
  const [balance, setBalance] = useState<string | null>(null);
  const [saveCount, setSaveCount] = useState<number | null>(null);
  const [lowBalance, setLowBalance] = useState(false);

  // connected agents (granular per-connector tokens)
  const [connectors, setConnectors] = useState<ConnectorListing[] | null>(null);
  const [newConnectorToken, setNewConnectorToken] = useState<string | null>(null);
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [connectorStatus, setConnectorStatus] = useState<StatusMessage>(blank);

  const setStatus = useCallback((key: StatusKey, text: string, kind: StatusKind = "") => {
    const msg = { text, kind };
    if (key === "st1") setSt1(msg);
    else if (key === "st2") setSt2(msg);
    else if (key === "st3") setSt3(msg);
    else setSt4(msg);
  }, []);

  // enable(n) / markDone(n) helpers mirror the legacy DOM helpers.
  const enable = useCallback((n: number) => {
    if (n === 2) setStep2On(true);
    else if (n === 3) setStep3On(true);
    else if (n === 4) setStep4On(true);
    else if (n === 5) setStep5On(true);
  }, []);
  const markDone = useCallback((n: number) => {
    if (n === 1) setStep1Done(true);
    else if (n === 2) setStep2Done(true);
    else if (n === 3) setStep3Done(true);
    else if (n === 4) setStep4Done(true);
  }, []);

  const getReadProvider = useCallback(() => {
    if (!readProviderRef.current) {
      readProviderRef.current = new JsonRpcProvider(GALILEO.params.rpcUrls[0]);
    }
    return readProviderRef.current;
  }, []);

  const saveSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const cur = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ ...cur, token: s.token, account: accountRef.current }),
    );
  }, []);

  // On-chain state is the source of truth + the SAME on every device (the signer is
  // deterministic from the wallet sig). Reflect deposit + authorize so the UI is
  // consistent wherever the user connects — already-authorized shows as done on a
  // brand-new device too.
  const checkChainState = useCallback(
    async (d: SessionData) => {
      const owner = d.wallet || accountRef.current || undefined;
      const read = getReadProvider();
      try {
        const bal = await read.getBalance(d.signerAddress);
        if (bal > 0n) {
          markDone(3);
          enable(4);
          setDepositEnabled(true);
          // ~0.0005 0G per save → warn under 0.01 0G (~20 saves) so the user tops up
          // BEFORE the signer runs out of gas and saves start failing.
          const low = bal < parseEther("0.01");
          setStatus(
            "st3",
            low
              ? `⚠ deposit LOW: ${formatEther(bal)} 0G left — top up soon or new saves will fail`
              : `funded ✓ (${formatEther(bal)} 0G remaining) — on-chain, any device`,
            low ? "err" : "ok",
          );
        }
      } catch {
        /* ignore */
      }
      try {
        if (!owner) return;
        const reg = new Contract(d.registry, REGISTRY_IS_DELEGATE_ABI, read);
        if (await reg.isDelegate(owner, d.signerAddress)) {
          markDone(4);
          enable(5);
          setStatus("st4", "already authorized ✓ — on-chain, works on any device", "ok");
        }
      } catch {
        /* ignore */
      }
    },
    [enable, markDone, setStatus, getReadProvider],
  );

  // Live usage tracker: the signer's remaining balance + the on-chain memory count.
  const refreshUsage = useCallback(async () => {
    const s = sessionRef.current;
    if (!s?.signerAddress) return;
    const read = getReadProvider();
    const owner = s.wallet || accountRef.current || undefined;
    try {
      const bal = await read.getBalance(s.signerAddress);
      setBalance(Number(formatEther(bal)).toFixed(4));
      setLowBalance(bal > 0n && bal < parseEther("0.01"));
    } catch {
      /* ignore */
    }
    try {
      if (owner) {
        const reg = new Contract(s.registry, REGISTRY_ROOT_COUNT_ABI, read);
        const n = (await reg.rootCount(owner)) as bigint;
        setSaveCount(Number(n));
      }
    } catch {
      /* ignore */
    }
  }, [getReadProvider]);

  // Load the wallet's connectors (labels/status only — no secrets). Bearer-authed.
  const refreshConnectors = useCallback(async () => {
    const token = sessionRef.current?.token;
    if (!token) return;
    try {
      const r = await fetch("/connectors", { headers: { Authorization: "Bearer " + token } });
      if (r.ok) {
        const j = (await r.json()) as { connectors?: ConnectorListing[] };
        setConnectors(j.connectors ?? []);
      }
    } catch {
      /* ignore — transient */
    }
  }, []);

  // Mint a new per-agent connector token. Authorized by the live session bearer (no extra wallet
  // popup — you're already signed in), so it's one click. Server returns the raw token ONCE.
  const mintConnector = useCallback(
    async (label: string) => {
      const name = label.trim();
      if (!name) {
        setConnectorStatus({ text: "give the agent a name first", kind: "err" });
        return;
      }
      const token = sessionRef.current?.token;
      if (!token) {
        setConnectorStatus({ text: "create a session first", kind: "err" });
        return;
      }
      try {
        setConnectorBusy(true);
        setNewConnectorToken(null);
        setConnectorStatus({ text: "adding…", kind: "" });
        const r = await fetch("/connectors/mint", {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ label: name }),
        });
        const j = (await r.json()) as { token?: string; reason?: string; error?: string };
        if (!r.ok || !j.token) throw new Error(j.reason || j.error || "mint failed");
        setNewConnectorToken(j.token);
        setConnectorStatus({ text: `added "${name}" ✓ — copy the config below, the token is shown only once`, kind: "ok" });
        await refreshConnectors();
      } catch (e: unknown) {
        setConnectorStatus({ text: (e as Error)?.message || String(e), kind: "err" });
      } finally {
        setConnectorBusy(false);
      }
    },
    [refreshConnectors],
  );

  // Revoke ONE connector (by opaque id). Kills only that agent's access — the others (and any
  // web/OAuth connections) keep working. Authorized by the session bearer; enforced server-side
  // on the very next request. (A fresh wallet sig is the cross-device fallback, server-side.)
  const revokeConnector = useCallback(
    async (id: string) => {
      const token = sessionRef.current?.token;
      if (!token) {
        setConnectorStatus({ text: "create a session first", kind: "err" });
        return;
      }
      try {
        setConnectorBusy(true);
        setConnectorStatus({ text: "revoking…", kind: "" });
        const r = await fetch("/connectors/revoke", {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ connectorId: id }),
        });
        const j = (await r.json()) as { ok?: boolean; reason?: string; error?: string };
        if (!r.ok) throw new Error(j.reason || j.error || "revoke failed");
        setConnectorStatus({ text: "revoked ✓ — that agent can no longer read or write your vault", kind: "ok" });
        await refreshConnectors();
      } catch (e: unknown) {
        setConnectorStatus({ text: (e as Error)?.message || String(e), kind: "err" });
      } finally {
        setConnectorBusy(false);
      }
    },
    [refreshConnectors],
  );

  const dismissNewToken = useCallback(() => setNewConnectorToken(null), []);

  const ensureGalileo = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) throw new Error("No wallet found");
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: GALILEO.chainIdHex }],
      });
    } catch (e: unknown) {
      const code = (e as { code?: number })?.code;
      if (code === 4902) {
        await eth.request({ method: "wallet_addEthereumChain", params: [GALILEO.params] });
      } else {
        throw e;
      }
    }
  }, []);

  // Same-device convenience: restore the cached session on load (no re-sign on refresh).
  const restore = useCallback(async () => {
    let saved: { token?: string; account?: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {
      saved = null;
    }
    if (!saved?.token) {
      setReady(true);
      return;
    }
    let d: SessionData;
    try {
      const r = await fetch("/session", { headers: { Authorization: "Bearer " + saved.token } });
      if (!r.ok) {
        // Server session gone (restart/redeploy/TTL). The memory key lives only in RAM and
        // is never persisted (so the operator can't read it) → a re-sign re-derives it.
        // Don't reset to step 1: keep the wallet connected and offer a ONE-CLICK re-sign.
        // Deposit + authorization are on-chain and reflect as done after signing.
        // The memory key lives only in RAM (never persisted, so the operator can't read it) →
        // a re-sign re-derives it. Keep the wallet connected (wagmi restores it + the bridge
        // effect rebuilds the signer + marks step 1) and offer a one-click re-sign; deposit +
        // authorization are on-chain and reflect as done after signing.
        localStorage.removeItem(LS_KEY);
        setStatus("st2", "session expired — sign once to unlock (your deposit + authorization are preserved)", "");
        setReady(true);
        return;
      }
      d = (await r.json()) as SessionData;
    } catch {
      setReady(true);
      return;
    }
    sessionRef.current = d;
    accountRef.current = saved.account || d.wallet || null;
    setSession(d);
    setAccount(accountRef.current);

    markDone(1);
    markDone(2);
    enable(3);
    enable(5);
    setSignEnabled(true);
    setDepositEnabled(true);
    setStatus("st1", `connected as ${short(accountRef.current || undefined)} ✓`, "ok");
    setStatus("st2", "session restored — no re-sign needed ✓", "ok");
    setReady(true);

    await checkChainState(d);
    // The signer is (re)built by the wagmi bridge effect once the wallet reconnects.
  }, [checkChainState, enable, markDone, setStatus]);

  // On load: restore a cached session. Run once. In OAuth mode we DON'T silently restore
  // (each connection must be freshly consented + a new code minted), but we still let the
  // user connect+sign; mark ready so the UI shows.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const o = readOAuthParams(); // client-only, post-hydration — no #418 mismatch
    setOauth(o);
    if (o) {
      // OAuth mode: don't silently restore (each connection is freshly consented + a new
      // code minted), but still let the user connect+sign; mark ready so the UI shows.
      setReady(true);
      return;
    }
    void restore();
  }, [restore]);

  // Auto-refresh the storage tracker while a session exists (every 30s + on tab focus),
  // so "remaining" stays current without a reconnect — catches mid-session depletion.
  useEffect(() => {
    if (!session?.signerAddress) return;
    void refreshUsage();
    const id = setInterval(() => void refreshUsage(), 30_000);
    const onFocus = () => void refreshUsage();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [session?.signerAddress, refreshUsage]);

  // Load connected agents once a normal-mode session (with a bearer) exists. OAuth-mode
  // consent screens have no session token to list against — skip there.
  useEffect(() => {
    if (!session?.token) return;
    void refreshConnectors();
  }, [session?.token, refreshConnectors]);

  // Bridge wagmi → the ethers signer the rest of the hook uses. Runs whenever the connected
  // wallet/chain changes: builds the signer, marks step 1 done, and reveals the sign step.
  useEffect(() => {
    if (isConnected && wagmiAddress && connectorClient) {
      try {
        const signer = clientToSigner(connectorClient);
        signerRef.current = signer;
        providerRef.current = signer.provider as BrowserProvider;
      } catch {
        /* ignore — signer rebuilds on the next change */
      }
      accountRef.current = wagmiAddress;
      setAccount(wagmiAddress);
      markDone(1);
      enable(2);
      setSignEnabled(true);
      if (!sessionRef.current) setStatus("st1", `connected as ${short(wagmiAddress)} ✓`, "ok");
    } else if (!isConnected) {
      signerRef.current = null;
      providerRef.current = null;
    }
  }, [isConnected, wagmiAddress, connectorClient, enable, markDone, setStatus]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setStatus("st1", "No wallet found — install MetaMask.", "err");
      return;
    }
    try {
      setStatus("st1", "connecting…");
      await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureGalileo();
      providerRef.current = new BrowserProvider(window.ethereum);
      signerRef.current = await providerRef.current.getSigner();
      accountRef.current = await signerRef.current.getAddress();
      setAccount(accountRef.current);
      setStatus("st1", "connected ✓", "ok");
      markDone(1);
      enable(2);
      setSignEnabled(true);
    } catch (e: unknown) {
      setStatus("st1", (e as Error)?.message || String(e), "err");
    }
  }, [ensureGalileo, enable, markDone, setStatus]);

  // Build the auth body: {wallet, signature} OR, if the server exposes a bootstrap pubkey,
  // {wallet, envelope} with the signature ECIES-encrypted to it. NOTE: the live server
  // decrypts in-process (not a sealed enclave), so the envelope only hides the signature
  // from a passive relay — NOT from the operator. Identical for /session and /authorize/approve.
  const buildAuthBody = useCallback(async (signature: string): Promise<Record<string, unknown>> => {
    let body: Record<string, unknown> = { wallet: accountRef.current, signature };
    try {
      const bp = await fetch("/bootstrap/pubkey");
      if (bp.ok) {
        const { pubkey } = (await bp.json()) as { pubkey?: string };
        if (pubkey) {
          body = {
            wallet: accountRef.current,
            envelope: await encryptToPubkey(pubkey, new TextEncoder().encode(signature)),
          };
        }
      }
    } catch {
      /* ignore — fall back to plaintext */
    }
    return body;
  }, []);

  const sign = useCallback(async () => {
    const signer = signerRef.current;
    if (!signer) {
      setStatus("st2", "connect a wallet first", "err");
      return;
    }
    try {
      setStatus("st2", "sign the message in your wallet…");
      const signature = await signer.signTypedData(DOMAIN, TYPES, MESSAGE);
      const authBody = await buildAuthBody(signature);

      // OAuth mode: POST the SAME auth body + the OAuth params to /authorize/approve.
      // We get back a redirect (redirect_uri?code=…&state=…) to send the user back with.
      if (oauth) {
        setStatus("st2", "approving connection…");
        const res = await fetch("/authorize/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin", // send the HttpOnly arca_authz cookie (anti session-fixation)
          body: JSON.stringify({
            ...authBody,
            client_id: oauth.client_id,
            redirect_uri: oauth.redirect_uri,
            code_challenge: oauth.code_challenge,
            code_challenge_method: oauth.code_challenge_method,
            state: oauth.state,
            resource: oauth.resource,
            scope: oauth.scope,
          }),
        });
        const data = (await res.json()) as {
          redirect?: string;
          signerAddress?: string;
          registry?: string;
          chainId?: number;
          error?: string;
          error_description?: string;
        };
        if (!res.ok || !data.redirect) throw new Error(data.error_description || data.error || "approve failed");

        // Synthesize a SessionData so steps 3-4 (deposit/authorize) + checkChainState work.
        const sd: SessionData = {
          token: "", // not exposed to web clients — they use the OAuth code/token
          wallet: accountRef.current ?? undefined,
          connectorUrl: "",
          signerAddress: data.signerAddress ?? "",
          registry: data.registry ?? "",
          chainId: data.chainId ?? 0,
        };
        sessionRef.current = sd;
        setSession(sd);
        setOauthRedirect(data.redirect);
        setStatus("st2", "signed ✓ — approve to continue", "ok");
        markDone(2);
        enable(3);
        enable(5);
        setDepositEnabled(true);
        if (data.signerAddress) await checkChainState(sd);
        return;
      }

      // Normal mode: create a session.
      setStatus("st2", "creating session…");
      const res = await fetch("/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(authBody),
      });
      const data = (await res.json()) as SessionData & { error?: string };
      if (!res.ok) throw new Error(data.error || "session failed");

      sessionRef.current = data;
      setSession(data);
      setStatus("st2", "session ready ✓", "ok");
      markDone(2);
      enable(3);
      setDepositEnabled(true);
      saveSession();
      await checkChainState(data); // reflect already-done deposit/authorize (any device)
    } catch (e: unknown) {
      setStatus("st2", (e as Error)?.message || String(e), "err");
    }
  }, [buildAuthBody, checkChainState, enable, markDone, oauth, saveSession, setStatus]);

  // Activate the vault: fund the signer's gas tank AND authorize it as a registry delegate, in
  // ONE step (two MetaMask popups, one mental action). Each on-chain action is SKIPPED if already
  // done (read on-chain first), so this is safe to re-run and works on a restored/partly-set-up
  // vault. Deposit funds an EOA; setDelegate flips a registry bool — two different targets, which
  // is why they're two txs (a true one-tx needs a payable contract change → deferred).
  const activate = useCallback(
    async (amount: string) => {
      const signer = signerRef.current;
      const s = sessionRef.current;
      if (!signer || !s) {
        setStatus("st3", "connect a wallet first", "err");
        return;
      }
      // On-chain actions must run on Arca's chain. If the wallet is elsewhere (e.g. switched
      // to mainnet), switch it and let the user re-click once the signer rebinds to the chain.
      if (walletChainId !== undefined && walletChainId !== APP_CHAIN.id) {
        try {
          setStatus("st3", `switching to ${APP_CHAIN.name}…`);
          await switchChainAsync({ chainId: APP_CHAIN.id });
          setStatus("st3", "switched ✓ — click Activate again to continue", "");
        } catch {
          setStatus("st3", `please switch your wallet to ${APP_CHAIN.name}`, "err");
        }
        return;
      }
      const read = getReadProvider();
      const owner = s.wallet || accountRef.current || undefined;
      setActivating(true);
      try {
        // 1. Fund the signer (skip if it already holds 0G).
        const bal = await read.getBalance(s.signerAddress);
        if (bal === 0n) {
          const amt = (amount || "0.1").trim();
          setStatus("st3", `funding storage (${amt} 0G)…`);
          const tx = await signer.sendTransaction({ to: s.signerAddress, value: parseEther(amt) });
          await tx.wait();
        }
        markDone(3);
        enable(4);

        // 2. Authorize the signer as a delegate (skip if already authorized).
        let authed = false;
        if (owner) {
          const reg = new Contract(s.registry, REGISTRY_IS_DELEGATE_ABI, read);
          authed = (await reg.isDelegate(owner, s.signerAddress)) as boolean;
        }
        if (!authed) {
          setStatus("st3", "authorizing your signer…");
          const reg = new Contract(s.registry, REGISTRY_SET_DELEGATE_ABI, signer);
          const tx = await reg.setDelegate(s.signerAddress, true);
          await tx.wait();
        }
        markDone(4);
        enable(5);
        setStatus("st3", "vault active ✓ — your agents can now save", "ok");
        void refreshUsage();
      } catch (e: unknown) {
        setStatus("st3", (e as Error)?.message || String(e), "err");
      } finally {
        setActivating(false);
      }
    },
    [enable, markDone, setStatus, getReadProvider, refreshUsage, walletChainId, switchChainAsync],
  );

  const disconnect = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    void disconnectAsync().finally(() => location.reload());
  }, [disconnectAsync]);

  return {
    account,
    session,
    step1Done,
    step2Done,
    step3Done,
    step4Done,
    step2On,
    step3On,
    step4On,
    step5On,
    signEnabled,
    depositEnabled,
    st1,
    st2,
    st3,
    st4,
    ready,
    oauth,
    oauthClient: oauth ? clientLabel(oauth) : null,
    oauthRedirect,
    balance,
    saveCount,
    lowBalance,
    signerExplorerUrl: session?.signerAddress ? `${EXPLORER}/address/${session.signerAddress}` : null,
    connectors,
    newConnectorToken,
    connectorBusy,
    connectorStatus,
    connect,
    sign,
    activate,
    activating,
    disconnect,
    mintConnector,
    revokeConnector,
    dismissNewToken,
  };
}
