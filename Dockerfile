FROM ghcr.io/agentgateway/agentgateway:v1.1.0 AS agw

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bash && rm -rf /var/lib/apt/lists/*
COPY --from=agw /app/agentgateway /usr/local/bin/agentgateway
COPY config.yaml /config.yaml
EXPOSE 3000 15000
ENTRYPOINT ["agentgateway"]
CMD ["-f", "/config.yaml"]
