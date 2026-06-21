# Arca MCP — image for a 0G Sandbox SEALED (TDX) container. Full bun runtime (NOT
# bun --compile: that miscompiles @noble/curves' secp256k1 init → "bad generator point").

# --- stage 1: build the Next.js dashboard (App Router) → static export in out/ ---
# Built here (linux) so @next/swc fetches the right platform binary; runtime stays lean.
FROM oven/bun:1.3-slim AS dashboard
WORKDIR /dash
COPY dashboard/package.json dashboard/bun.lock* ./
RUN bun install --frozen-lockfile
COPY dashboard/ ./
RUN bun run build

# --- stage 2: the MCP server + the prebuilt static dashboard (no Next.js in runtime) ---
FROM oven/bun:1.3-slim
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY src ./src
# express.static serves this dir — it's the Next.js static export (index.html + _next/).
COPY --from=dashboard /dash/out ./dashboard
ENV ARCA_PORT=8080
ENV ARCA_DASHBOARD_DIR=/app/dashboard
EXPOSE 8080
CMD ["bun", "src/transport/http-server.ts"]
