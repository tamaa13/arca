# Arca MCP — image for a 0G Sandbox SEALED (TDX) container. Full bun runtime (NOT
# bun --compile: that miscompiles @noble/curves' secp256k1 init → "bad generator point").
FROM oven/bun:1.3-slim
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY dashboard ./dashboard
ENV ARCA_PORT=8080
ENV ARCA_DASHBOARD_DIR=/app/dashboard
EXPOSE 8080
CMD ["bun", "src/transport/http-server.ts"]
