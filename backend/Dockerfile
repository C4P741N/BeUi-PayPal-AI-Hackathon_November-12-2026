FROM rust:1-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app

WORKDIR /app
COPY --from=builder /app/target/release/paypal-ai-hackathon_november-12-2026 /usr/local/bin/paypal-backend

USER app

ENV PORT=3001
EXPOSE 3001

CMD ["/usr/local/bin/paypal-backend"]
