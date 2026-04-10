FROM ghcr.io/agentgateway/agentgateway:v1.1.0 AS agw

FROM cgr.dev/chainguard/glibc-dynamic
USER root

# Install busybox for bash/sh (needed by Coolify health checks)
COPY --from=busybox:uclibc /bin/busybox /bin/busybox
RUN /bin/busybox --install -s /bin

COPY --from=agw /app/agentgateway /app/agentgateway
COPY config.yaml /config.yaml
EXPOSE 3000 15000
ENTRYPOINT ["/app/agentgateway"]
CMD ["-f", "/config.yaml"]
