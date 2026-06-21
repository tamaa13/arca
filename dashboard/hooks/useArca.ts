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
  Contract,
  parseEther,
  formatEther,
  type JsonRpcSigner,
} from "ethers";
import {
  GALILEO,
  DOMAIN,
  TYPES,
  MESSAGE,
  LS_KEY,
  REGISTRY_IS_DELEGATE_ABI,
  REGISTRY_SET_DELEGATE_ABI,
} from "@/lib/constants";
import { encryptToPubkey } from "@/lib/crypto";
import { readOAuthParams, clientLabel, type OAuthParams } from "@/lib/oauth";
import type { SessionData, StatusMessage, StatusKind } from "@/lib/types";

const short = (a?: string) => (a ? a.slice(0, 8) + "…" + a.slice(-6) : "");

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
  depositEnabled: boolean;
  delegateEnabled: boolean;
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
}

export interface ArcaApi extends ArcaState {
  connect: () => Promise<void>;
  sign: () => Promise<void>;
  deposit: (amount: string) => Promise<void>;
  authorize: () => Promise<void>;
  disconnect: () => void;
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
  const [delegateEnabled, setDelegateEnabled] = useState(false);

  const [st1, setSt1] = useState<StatusMessage>(blank);
  const [st2, setSt2] = useState<StatusMessage>(blank);
  const [st3, setSt3] = useState<StatusMessage>(blank);
  const [st4, setSt4] = useState<StatusMessage>(blank);

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
          setDelegateEnabled(true);
          setStatus("st3", `funded ✓ (${formatEther(bal)} 0G) — on-chain, any device`, "ok");
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
        localStorage.removeItem(LS_KEY);
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

    // silent reconnect so a pending deposit/authorize still works
    if (window.ethereum) {
      try {
        const a = await window.ethereum.request<string[]>({ method: "eth_accounts" });
        if (a?.[0]?.toLowerCase() === accountRef.current?.toLowerCase()) {
          providerRef.current = new BrowserProvider(window.ethereum);
          signerRef.current = await providerRef.current.getSigner();
        }
      } catch {
        /* ignore */
      }
    }
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

  const deposit = useCallback(
    async (amount: string) => {
      const signer = signerRef.current;
      const s = sessionRef.current;
      if (!signer || !s) {
        setStatus("st3", "connect a wallet first", "err");
        return;
      }
      try {
        const amt = (amount || "0.1").trim();
        setStatus("st3", `sending ${amt} 0G to the signer…`);
        const tx = await signer.sendTransaction({
          to: s.signerAddress,
          value: parseEther(amt),
        });
        await tx.wait();
        setStatus("st3", `deposited ${amt} 0G ✓ (${short(tx.hash)})`, "ok");
        markDone(3);
        enable(4);
        setDelegateEnabled(true);
      } catch (e: unknown) {
        setStatus("st3", (e as Error)?.message || String(e), "err");
      }
    },
    [enable, markDone, setStatus],
  );

  const authorize = useCallback(async () => {
    const signer = signerRef.current;
    const s = sessionRef.current;
    if (!signer || !s) {
      setStatus("st4", "connect a wallet first", "err");
      return;
    }
    try {
      setStatus("st4", "authorizing in your wallet…");
      const reg = new Contract(s.registry, REGISTRY_SET_DELEGATE_ABI, signer);
      const tx = await reg.setDelegate(s.signerAddress, true);
      await tx.wait();
      setStatus("st4", `authorized ✓ (${short(tx.hash)}) — your agents can now save.`, "ok");
      markDone(4);
      enable(5);
    } catch (e: unknown) {
      setStatus("st4", (e as Error)?.message || String(e), "err");
    }
  }, [enable, markDone, setStatus]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    location.reload();
  }, []);

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
    delegateEnabled,
    st1,
    st2,
    st3,
    st4,
    ready,
    oauth,
    oauthClient: oauth ? clientLabel(oauth) : null,
    oauthRedirect,
    connect,
    sign,
    deposit,
    authorize,
    disconnect,
  };
}
