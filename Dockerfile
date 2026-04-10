FROM docker.io/library/busybox:stable AS busybox

FROM cr.agentgateway.dev/agentgateway:v1.1.0
COPY --from=busybox /bin/busybox /bin/busybox
COPY --from=busybox /bin/sh /bin/sh
COPY --from=busybox /bin/bash /bin/bash
COPY config.yaml /config.yaml
EXPOSE 3000 15000
CMD ["-f", "/config.yaml"]
