# Arca MCP — the image that runs inside a 0G Sandbox SEALED (TDX) container.
# Sealed mode denies external exec, so the server must start FROM the image (here),
# not be bootstrapped after creation. The enclave generates its bootstrap keypair
# in-process at start; the operator/relay never holds it.
#
# Build + push to a registry the 0G Sandbox provider can pull, then:
#   bun scripts/sandbox-deploy.ts   (with ARCA_IMAGE=<your pushed ref>)
FROM oven/bun:1.3-slim
WORKDIR /app

# deps first (cache layer)
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# app
COPY src ./src
COPY dashboard ./dashboard

# 0G Sandbox routes inbound to port 8080 (<port>-<id>.<host>).
ENV ARCA_PORT=8080
EXPOSE 8080

# Serves: the MCP (/mcp), the dashboard (/), and /bootstrap/pubkey (operator-blind handoff).
CMD ["bun", "src/transport/http-server.ts"]
