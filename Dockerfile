FROM ghcr.io/agentgateway/agentgateway:v1.1.0 AS agw

FROM oven/bun:1-debian AS sigari-deps
WORKDIR /sigari
COPY sigari/package.json ./
RUN bun install --production

FROM debian:trixie-slim

# Install runtime deps for stdio MCP servers
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl nodejs npm python3 python3-pip pipx unzip \
    && rm -rf /var/lib/apt/lists/* \
    && pipx install uvx || true

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:/root/.local/bin:$PATH"

# AgentGateway binary
COPY --from=agw /app/agentgateway /app/agentgateway
COPY config.yaml /config.yaml
COPY jwks.json /jwks.json

# Sigari LLM gateway
COPY --from=sigari-deps /sigari/node_modules /sigari/node_modules
COPY sigari/package.json /sigari/package.json
COPY sigari/index.ts /sigari/index.ts

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 4000 15000

ENTRYPOINT ["/entrypoint.sh"]
