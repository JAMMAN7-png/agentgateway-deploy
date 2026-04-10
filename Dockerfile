FROM ghcr.io/agentgateway/agentgateway:v1.1.0

# Install bash for Coolify health checks
USER root
RUN if command -v apk > /dev/null 2>&1; then apk add --no-cache bash; \
    elif command -v apt-get > /dev/null 2>&1; then apt-get update && apt-get install -y bash && rm -rf /var/lib/apt/lists/*; \
    fi || true

COPY config.yaml /config.yaml

EXPOSE 3000 15000

CMD ["-f", "/config.yaml"]
