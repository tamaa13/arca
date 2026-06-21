// OAuth-mode detection for the dashboard SPA.
//
// When the hosted server serves THIS static export at `/authorize`, the OAuth params
// ride in window.location.search. If client_id + redirect_uri + code_challenge are all
// present we're in OAuth mode: the same connect→sign flow runs, but the sign step calls
// POST /authorize/approve (instead of POST /session) and we redirect back to the client.

export interface OAuthParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  response_type: string;
  state?: string;
  scope?: string;
  resource?: string;
}

/** Read OAuth params from the current URL, or null if not in OAuth mode (SSR-safe). */
export function readOAuthParams(): OAuthParams | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const client_id = q.get("client_id") ?? "";
  const redirect_uri = q.get("redirect_uri") ?? "";
  const code_challenge = q.get("code_challenge") ?? "";
  if (!client_id || !redirect_uri || !code_challenge) return null;
  return {
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method: q.get("code_challenge_method") ?? "S256",
    response_type: q.get("response_type") ?? "code",
    state: q.get("state") ?? undefined,
    scope: q.get("scope") ?? undefined,
    resource: q.get("resource") ?? undefined,
  };
}

/** A human label for the consent UI: the client app's host (or its id as a fallback). */
export function clientLabel(p: OAuthParams): string {
  try {
    return new URL(p.redirect_uri).host;
  } catch {
    return p.client_id;
  }
}
