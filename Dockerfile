FROM cr.agentgateway.dev/agentgateway:v1.1.0
COPY config.yaml /config.yaml
ENTRYPOINT ["agentgateway"]
CMD ["-f", "/config.yaml"]
