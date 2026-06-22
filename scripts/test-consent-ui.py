"""
Hermetic UI test for PR #4 — lightened OAuth (web) consent. Loads the dashboard in OAuth mode
(query params at /authorize) with a mock wallet + stubbed /authorize/approve, then proves:
  - after Connect + Sign, the "Approve & connect" card renders ABOVE the funding card,
  - its Approve button is ENABLED immediately (no funding required to connect),
  - the funding card is demoted to the optional "Fund your memory" (not "Activate your memory").
Run via with_server (serves dashboard/out):
  python .../with_server.py --server "python3 -m http.server 8798 -d dashboard/out" --port 8798 \
      -- python3 scripts/test-consent-ui.py
"""
import sys
from urllib.parse import quote
from playwright.sync_api import sync_playwright

REDIRECT = "https://claude.ai/cb"
OAUTH_Q = ("?response_type=code&client_id=testclient&redirect_uri=" + quote(REDIRECT) +
           "&code_challenge=testchallenge123&code_challenge_method=S256&state=xyz")
BASE = "http://localhost:8798"
ADDR = "0x1111111111111111111111111111111111111111"
CANNED_SIG = "0x" + "ab" * 65

EIP1193 = """
window.ethereum = {
  isMetaMask: true, _addr: "%s",
  request: async ({ method }) => {
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


def main():
    npass, nfail = 0, 0

    def ok(cond, msg):
        nonlocal npass, nfail
        print(("PASS " if cond else "FAIL ") + msg)
        if cond:
            npass += 1
        else:
            nfail += 1

    def handle_approve(route):
        route.fulfill(status=200, content_type="application/json", body=(
            '{"redirect":"%s?code=abc123&state=xyz","signerAddress":"0x2222222222222222222222222222222222222222",'
            '"registry":"0xc196C28886c93462f55A78134b5bF6118A3f5860","chainId":16602}' % REDIRECT))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.add_init_script(EIP1193)

        def rk_connect():
            page.get_by_role("button", name="Connect Wallet").first.click()
            page.wait_for_timeout(800)
            opt = page.get_by_test_id("rk-wallet-option-metaMask")
            if opt.count() == 0:
                opt = page.get_by_test_id("rk-wallet-option-injected")
            if opt.count() == 0:
                opt = page.get_by_text("MetaMask", exact=True)
            opt.first.click()
            page.wait_for_timeout(1600)

        page.route("**/bootstrap/pubkey", lambda r: r.fulfill(status=404, body="{}"))
        page.route("**/authorize/approve", handle_approve)
        page.route("**/health", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true,"chainId":16602,"registry":"0xc196C28886c93462f55A78134b5bF6118A3f5860"}'))
        page.route("**/evmrpc-testnet.0g.ai/**", lambda r: r.abort())

        page.goto(BASE + "/app.html" + OAUTH_Q)
        page.wait_for_load_state("networkidle")

        # OAuth mode: lede mentions the requesting app.
        ok(page.get_by_text("wants to connect to your Arca memory", exact=False).count() > 0, "OAuth consent mode detected")

        # wagmi auto-connects the injected mock on mount → wait for the sign step, then sign.
        page.get_by_role("button", name="create session").wait_for(timeout=12000)
        page.get_by_role("button", name="create session").click()
        page.wait_for_timeout(900)

        # Approve card present + enabled (no funding done).
        approve_btn = page.get_by_role("button", name="Approve & continue")
        ok(approve_btn.count() > 0, "'Approve & continue' button present after sign")
        ok(approve_btn.first.is_enabled(), "Approve button ENABLED immediately (funding NOT required to connect)")

        # Funding demoted to optional.
        ok(page.get_by_role("heading", name="Fund your memory").count() > 0, "funding card demoted to optional 'Fund your memory'")
        ok(page.get_by_text("Optional now", exact=False).count() > 0, "funding marked optional in copy")
        ok(page.get_by_role("heading", name="Activate your memory").count() == 0, "no mandatory 'Activate your memory' in OAuth mode")

        # Ordering: Approve heading appears ABOVE the Fund heading.
        heads = [h.inner_text().lower().replace("\n", " ") for h in page.query_selector_all("h2")]
        joined = " | ".join(heads)
        ai = next((i for i, h in enumerate(heads) if "approve & connect" in h), -1)
        fi = next((i for i, h in enumerate(heads) if "fund your memory" in h), -1)
        ok(ai >= 0 and fi >= 0 and ai < fi, "Approve card is ABOVE the Fund card (order: %s)" % joined)

        page.screenshot(path="/tmp/arca-consent-ui.png", full_page=True)
        browser.close()

    print("\n%s — %d passed, %d failed" % ("ALL PASS" if nfail == 0 else "FAIL", npass, nfail))
    sys.exit(1 if nfail else 0)


if __name__ == "__main__":
    main()
