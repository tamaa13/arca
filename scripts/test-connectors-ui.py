"""
Hermetic UI test for the dashboard "Connected agents" panel.

The server + crypto path is already proven by the bun E2E tests (test-connectors*-e2e.ts).
This test isolates the DASHBOARD wiring: it stubs the API + on-chain reads with route
interception and injects a mock window.ethereum (canned signatures — the stubbed server
ignores them), then drives the real built UI to prove:
  - the panel renders the connector list (a pre-existing web/OAuth row),
  - "Add agent" mints → the raw token is shown ONCE,
  - the new connector appears as Active in the list,
  - "Revoke" flips a connector to Revoked (and hides its Revoke button),
  - selective: revoking one row leaves the others Active.

Static files are served by `python -m http.server` over dashboard/out (see with_server).
Run via:
  python scripts/.../with_server.py --server "python3 -m http.server 8799 -d dashboard/out" \
      --port 8799 -- python3 scripts/test-connectors-ui.py
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8799"
ADDR = "0x1111111111111111111111111111111111111111"
SIGNER = "0x2222222222222222222222222222222222222222"
REGISTRY = "0xc196C28886c93462f55A78134b5bF6118A3f5860"
CANNED_SIG = "0x" + "ab" * 65  # 65-byte r‖s‖v — passes the dashboard's shape, server is stubbed

# Mutable server-side connector state the route handlers read/write.
state = {
    "connectors": [
        {"id": "web-claude", "label": "claude.ai", "kind": "oauth",
         "createdAt": 1718000000, "expiresAt": 0, "revoked": False},
    ],
    "mintCount": 0,
}

EIP1193 = """
window.ethereum = {
  isMetaMask: true,
  _addr: "%s",
  request: async ({ method, params }) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts": return [window.ethereum._addr];
      case "eth_chainId": return "0x40DA";
      case "net_version": return "16602";
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain": return null;
      case "eth_signTypedData_v4":
      case "personal_sign":
      case "eth_sign": return "%s";
      default: return null;
    }
  },
  on: () => {}, removeListener: () => {},
};
""" % (ADDR, CANNED_SIG)


def handle_session(route):
    route.fulfill(status=200, content_type="application/json", body=json.dumps({
        "token": "arca_live_SESSIONTOKEN", "wallet": ADDR, "connectorUrl": BASE + "/mcp",
        "signerAddress": SIGNER, "registry": REGISTRY, "chainId": 16602,
        "next": "fund + delegate",
    }))


def handle_connectors_list(route):
    route.fulfill(status=200, content_type="application/json",
                  body=json.dumps({"connectors": state["connectors"]}))


def handle_mint(route):
    state["mintCount"] += 1
    n = state["mintCount"]
    body = json.loads(route.request.post_data or "{}")
    label = body.get("label", "agent")
    cid = "cli-%d" % n
    state["connectors"] = [
        {"id": cid, "label": label, "kind": "cli",
         "createdAt": 1781000000, "expiresAt": 1900000000, "revoked": False},
    ] + state["connectors"]
    route.fulfill(status=200, content_type="application/json", body=json.dumps({
        "token": "arca_live_NEWTOKEN_%d_abcdef" % n, "id": cid, "label": label, "expiresAt": 1900000000,
    }))


def handle_revoke(route):
    body = json.loads(route.request.post_data or "{}")
    cid = body.get("connectorId")
    for c in state["connectors"]:
        if c["id"] == cid:
            c["revoked"] = True
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))


def main():
    npass, nfail = 0, 0

    def ok(cond, msg):
        nonlocal npass, nfail
        print(("PASS " if cond else "FAIL ") + msg)
        if cond:
            npass += 1
        else:
            nfail += 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.add_init_script(EIP1193)
        page.on("dialog", lambda dlg: dlg.accept())  # auto-accept the revoke window.confirm

        # Stub the API + on-chain reads. Order: specific first.
        page.route("**/bootstrap/pubkey", lambda r: r.fulfill(status=404, body="{}"))
        page.route("**/connectors/mint", handle_mint)
        page.route("**/connectors/revoke", handle_revoke)
        page.route("**/connectors", handle_connectors_list)
        page.route("**/session", handle_session)
        # On-chain reads (balance / rootCount / isDelegate) → abort; the UI catches and degrades.
        page.route("**/evmrpc-testnet.0g.ai/**", lambda r: r.abort())

        page.goto(BASE + "/app.html")
        page.wait_for_load_state("networkidle")

        # Connect → Sign (drives /session via the mock wallet) so the panel appears.
        page.get_by_role("button", name="Connect wallet").click()
        page.wait_for_timeout(500)
        # The sign button label in CreateSessionStep is "Sign & create session".
        page.get_by_role("button", name="create session").click()
        page.wait_for_timeout(900)

        # Panel present.
        panel = page.get_by_role("heading", name="Your agents")
        ok(panel.count() > 0, "Your agents panel rendered")
        ok(page.get_by_text("/mcp", exact=False).count() > 0, "endpoint URL shown")

        # Pre-existing web/OAuth connector listed with the Sign-in badge.
        ok(page.get_by_text("claude.ai", exact=True).count() > 0, "web connector (claude.ai) listed")
        ok(page.get_by_text("Sign-in", exact=True).count() > 0, "OAuth connector shows the Sign-in badge")

        # Add a CLI connector.
        page.get_by_placeholder("name this agent").fill("Codex-laptop")
        page.get_by_role("button", name="Create token").click()
        page.wait_for_timeout(700)

        # Raw token shown ONCE.
        token_shown = page.get_by_text("arca_live_NEWTOKEN_1", exact=False).count() > 0
        ok(token_shown, "minted token shown once after Create token")
        ok(page.get_by_text("shown only once", exact=False).count() > 0, "one-time-copy warning shown")

        # New connector appears as a CLI row + Active.
        ok(page.get_by_text("Codex-laptop", exact=True).count() > 0, "new token connector listed")
        ok(page.get_by_text("Token", exact=True).count() >= 1, "minted connector shows the Token badge")
        ok(page.get_by_text("Active", exact=True).count() == 2, "both connectors Active before revoke")

        # Dismiss the token banner.
        page.get_by_role("button", name="Done").click()
        page.wait_for_timeout(200)
        ok(page.get_by_text("arca_live_NEWTOKEN_1", exact=False).count() == 0, "token hidden after Done")

        # Revoke the CLI connector — find its row's Revoke button (first row = newest = CLI).
        revoke_btns = page.get_by_role("button", name="Revoke")
        ok(revoke_btns.count() == 2, "two Revoke buttons (both active) before revoke")
        revoke_btns.first.click()
        page.wait_for_timeout(700)

        # The CLI row flips to Revoked; the web row stays Active (selective).
        ok(page.get_by_text("Revoked", exact=True).count() == 1, "exactly one connector now Revoked")
        ok(page.get_by_text("Active", exact=True).count() == 1, "the web connector stays Active (selective ✓)")
        ok(page.get_by_role("button", name="Revoke").count() == 1, "only the web connector still revocable (selective ✓)")
        ok(page.get_by_text("revoked ✓", exact=False).count() > 0, "revoke success status shown")

        # ChatGPT has its OWN tab → sign-in tutorial (custom connector, no token) + honesty caption.
        page.get_by_role("button", name="ChatGPT", exact=True).click()
        page.wait_for_timeout(300)
        ok(page.get_by_text("custom connector", exact=False).count() > 0, "ChatGPT tab shows the custom-connector sign-in tutorial")
        ok(page.get_by_text("Works by spec", exact=False).count() > 0, "ChatGPT tab shows the unverified honesty caption")

        # Claude.ai is now a SEPARATE tab from Claude Code (no longer mixed into one "Web" tab).
        page.get_by_role("button", name="Claude.ai", exact=True).click()
        page.wait_for_timeout(300)
        ok(page.get_by_text("Settings → Connectors", exact=False).count() > 0, "Claude.ai has its own tab, split from Claude Code")

        page.screenshot(path="/tmp/arca-connectors-ui.png", full_page=True)
        browser.close()

    print("\n%s — %d passed, %d failed" % ("ALL PASS" if nfail == 0 else "FAIL", npass, nfail))
    sys.exit(1 if nfail else 0)


if __name__ == "__main__":
    main()
