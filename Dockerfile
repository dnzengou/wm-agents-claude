# ── Multi-arch Rust build ─────────────────────────────────────────────────────
# Supports linux/amd64 (Railway) and linux/arm64 (Apple Silicon, Graviton).
#
# Build strategy: compile natively on BUILDPLATFORM, then copy to the correct
# TARGETPLATFORM runtime image. Cross-compilation via aarch64-linux-gnu toolchain
# avoids slow QEMU emulation when building arm64 on x86_64 hosts.
#
# Usage:
#   docker buildx build --platform linux/amd64,linux/arm64 -t worldmonitor .

# ── Stage 1: dependency cache ──────────────────────────────────────────────────
# Runs on the BUILD machine's native platform for maximum speed.
# ARG values are injected by docker buildx.
ARG BUILDPLATFORM=linux/amd64
ARG TARGETARCH=amd64

FROM --platform=${BUILDPLATFORM} rust:1.86-slim-bookworm AS deps

ARG TARGETARCH

WORKDIR /app

# Base build tools (always needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# ARM64 cross-compilation toolchain — only installed when targeting arm64
RUN if [ "${TARGETARCH}" = "arm64" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
        gcc-aarch64-linux-gnu libc6-dev-arm64-cross libssl-dev:arm64 2>/dev/null || \
        apt-get install -y --no-install-recommends gcc-aarch64-linux-gnu libc6-dev-arm64-cross; \
      rustup target add aarch64-unknown-linux-gnu; \
      rm -rf /var/lib/apt/lists/*; \
    fi

# Prime the dependency layer (dummy main to avoid re-compiling deps on source change)
COPY worldmonitor-core/Cargo.toml ./

RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    if [ "${TARGETARCH}" = "arm64" ]; then \
      CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
      cargo build --release --target aarch64-unknown-linux-gnu; \
    else \
      cargo build --release; \
    fi && \
    rm -rf src

# ── Stage 2: full build ────────────────────────────────────────────────────────
FROM deps AS builder

ARG TARGETARCH

COPY worldmonitor-core/src    ./src
COPY worldmonitor-core/static ./static

# Touch main.rs to force recompilation of app code (not deps)
RUN touch src/main.rs && \
    if [ "${TARGETARCH}" = "arm64" ]; then \
      CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
      cargo build --release --target aarch64-unknown-linux-gnu && \
      cp target/aarch64-unknown-linux-gnu/release/worldmonitor target/release/worldmonitor; \
    else \
      cargo build --release; \
    fi

# ── Stage 3: minimal runtime image ────────────────────────────────────────────
# Uses the TARGET platform so the binary runs natively.
ARG TARGETPLATFORM=linux/amd64

FROM --platform=${TARGETPLATFORM} debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 libsqlite3-0 curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data

COPY --from=builder /app/target/release/worldmonitor /app/worldmonitor
COPY --from=builder /app/static                       /app/static

ENV RUST_LOG=info
ENV DATABASE_URL=sqlite:/app/data/worldmonitor.db
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:${PORT}/health || exit 1

CMD ["/app/worldmonitor"]
