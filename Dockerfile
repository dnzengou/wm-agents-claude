# ── Stage 1: dependency cache ─────────────────────────────────────────────────
# Copy only Cargo.toml first so this layer is reused as long as deps don't change.
# Cargo.lock is intentionally omitted — it is not committed to this repo.
FROM rust:1.86-slim-bookworm AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Build context is the repo root; source lives in worldmonitor-core/
COPY worldmonitor-core/Cargo.toml ./

RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src

# ── Stage 2: full build ───────────────────────────────────────────────────────
FROM deps AS builder

COPY worldmonitor-core/src ./src
COPY worldmonitor-core/static ./static

# Force cargo to recompile our code (not deps)
RUN touch src/main.rs && cargo build --release

# ── Stage 3: minimal runtime ──────────────────────────────────────────────────
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
