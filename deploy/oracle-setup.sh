#!/usr/bin/env bash
# Arca — one-command always-on deploy for an Oracle Cloud Free Tier VM (Ubuntu 22, ARM or x86).
# Run on a FRESH VM:
#   curl -fsSL https://raw.githubusercontent.com/tamaa13/arca/main/deploy/oracle-setup.sh | bash
#
# Uses cloudflared (outbound tunnel) for the public HTTPS URL → NO inbound firewall / OCI
# security-list changes needed. systemd keeps the server + tunnel always-on (restart on crash/reboot).
# No secrets: the server mints a per-user session-signer; each user funds their own via the dashboard.
set -euo pipefail
echo "== Arca · Oracle deploy =="

# 1. deps: git, bun, cloudflared
if command -v apt-get >/dev/null 2>&1; then sudo apt-get update -y -qq && sudo apt-get install -y -qq git curl unzip
elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y -q git curl unzip
elif command -v yum >/dev/null 2>&1; then sudo yum install -y -q git curl unzip; fi
if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash; fi
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v cloudflared >/dev/null 2>&1; then
  case "$(uname -m)" in aarch64|arm64) CF=arm64;; *) CF=amd64;; esac
  curl -fsSL -o /tmp/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF"
  sudo install /tmp/cloudflared /usr/local/bin/cloudflared
fi

# 2. code
cd "$HOME"
if [ -d arca/.git ]; then (cd arca && git pull --ff-only); else git clone --depth 1 https://github.com/tamaa13/arca; fi
cd "$HOME/arca" && "$HOME/.bun/bin/bun" install

# 3. systemd: Arca MCP (always-on, restart on crash)
sudo tee /etc/systemd/system/arca.service >/dev/null <<UNIT
[Unit]
Description=Arca MCP
After=network-online.target
Wants=network-online.target
[Service]
User=$USER
WorkingDirectory=$HOME/arca
EnvironmentFile=$HOME/arca/.env.testnet
Environment=ARCA_PORT=8787
ExecStart=$HOME/.bun/bin/bun src/transport/http-server.ts
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT

# 4. systemd: public HTTPS tunnel (cloudflared, outbound only)
sudo tee /etc/systemd/system/arca-tunnel.service >/dev/null <<UNIT
[Unit]
Description=Arca Cloudflare Tunnel
After=arca.service
[Service]
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:8787 --no-autoupdate
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now arca arca-tunnel

# 5. surface the public URL
echo "== waiting for server + tunnel =="
URL=""
for i in $(seq 1 40); do
  URL=$(sudo journalctl -u arca-tunnel --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
  [ -n "$URL" ] && break; sleep 2
done
echo ""
echo "================================================================"
echo " ARCA LIVE (always-on via systemd)"
echo "   Dashboard : ${URL:-'(run: sudo journalctl -u arca-tunnel | grep trycloudflare')}/"
echo "   Connector : ${URL}/mcp"
echo "   Manage    : sudo systemctl status arca arca-tunnel"
echo "================================================================"
echo "Note: the trycloudflare URL is stable while the tunnel runs; it changes on tunnel restart."
echo "For a permanent custom URL, run a NAMED cloudflared tunnel (free CF account)."
