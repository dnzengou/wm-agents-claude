# ── Stage 1: dependency cache layer ──────────────────────────────────────────
# Separate layer so `cargo build --release` only re-runs when src changes,
# not on every Cargo.lock touch.
FROM rust:1.86-slim-bookworm AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
# Build a dummy main to cache dependencies (Cargo.lock is not committed)
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src

# ── Stage 2: full build ───────────────────────────────────────────────────────
FROM deps AS builder

COPY src ./src
COPY static ./static
# Touch main.rs so cargo knows src changed
RUN touch src/main.rs && cargo build --release

# ── Stage 3: minimal runtime image ───────────────────────────────────────────
FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data

COPY --from=builder /app/target/release/worldmonitor /app/worldmonitor
COPY --from=builder /app/static /app/static

ENV RUST_LOG=info
ENV DATABASE_URL=sqlite:/app/data/worldmonitor.db
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8080/health || exit 1

CMD ["/app/worldmonitor"]
