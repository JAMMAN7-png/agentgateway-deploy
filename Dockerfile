FROM ghcr.io/agentgateway/agentgateway:v1.1.0 AS agw

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=agw /app/agentgateway /app/agentgateway
COPY config.yaml /config.yaml
EXPOSE 3000 15000
ENTRYPOINT ["/app/agentgateway"]
CMD ["-f", "/config.yaml"]
