# FlashForge WebUI container image.
#
# The image wraps the prebuilt release binaries (the same files attached to each
# GitHub Release), so the container runs exactly what the binary users run. It
# does not compile anything, which keeps multi-arch builds fast and free of QEMU.
#
# Build context layout expected by this Dockerfile:
#   docker-bin/linux-amd64   <- flashforge-webui-linux-x64.bin
#   docker-bin/linux-arm64   <- flashforge-webui-linux-arm64.bin
#   docker-bin/linux-armv7   <- flashforge-webui-linux-armv7.bin
# The docker-image workflow (.github/workflows/docker-image.yml) prepares it.
#
# Originally proposed by jasonmeisel in Parallel-7/FlashForgeWebUI#25.

# Runs on the build host only: creates the data directory owned by the runtime
# user, so the final stage needs no RUN step (and no emulation) on any platform.
FROM --platform=$BUILDPLATFORM busybox:1.37 AS prep
RUN mkdir -p /out/data && chown 1000:1000 /out/data

FROM debian:bookworm-slim

ARG TARGETARCH
ARG TARGETVARIANT

LABEL org.opencontainers.image.title="FlashForge WebUI" \
      org.opencontainers.image.description="Standalone web interface for FlashForge 3D printers" \
      org.opencontainers.image.source="https://github.com/Parallel-7/FlashForgeWebUI" \
      org.opencontainers.image.licenses="MIT"

COPY --chmod=0755 docker-bin/linux-${TARGETARCH}${TARGETVARIANT} /app/flashforge-webui
COPY --from=prep --chown=1000:1000 /out/data /data

# DATA_DIR holds config.json, printer_details.json (printer check codes), the
# thumbnail cache, logs, and the extracted go2rtc binary. Keep it on a volume.
ENV DATA_DIR=/data \
    HOME=/tmp \
    NODE_ENV=production

WORKDIR /app
USER 1000:1000
VOLUME ["/data"]

# 3000: WebUI (the only port to expose or forward; camera video is tunneled
# through it). 8555: go2rtc WebRTC media. go2rtc's API and RTSP ports bind to
# loopback inside the container and are never published.
EXPOSE 3000 8555

ENTRYPOINT ["/app/flashforge-webui"]
CMD ["--all-saved-printers"]
