FROM ghcr.io/agentgateway/agentgateway:v1.1.0 AS agw

FROM debian:trixie-slim

# Install runtime deps for stdio MCP servers
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl nodejs npm python3 python3-pip pipx \
    && rm -rf /var/lib/apt/lists/* \
    && pipx install uvx || true

# Make pipx binaries available
ENV PATH="/root/.local/bin:$PATH"

COPY --from=agw /app/agentgateway /app/agentgateway
COPY config.yaml /config.yaml
COPY jwks.json /jwks.json

EXPOSE 3000 15000

ENTRYPOINT ["/app/agentgateway"]
CMD ["-f", "/config.yaml"]
