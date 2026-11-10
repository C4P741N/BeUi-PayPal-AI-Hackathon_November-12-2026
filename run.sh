#!/bin/bash

set -e

clear

#set +x #Uncomment to enable debugging

ENV_FILE=".env"
COMPOSE_FILE="docker-compose.pgsql.yml"


# Ensure .env esists
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found!"
    exit 1
fi

# Else load environment variables
set -a
source "$ENV_FILE"
set +a

# Validate required variable
: "${DATABASE_USER:?DATABASE_USER is missing from .env}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD is missing from .env}"
: "${DATABASE_NAME:?DATABASE_NAME is missing from .env}"
: "${DATABASE_PORT:?DATABASE_PORT is missing from .env}"

echo "Starting PostgreSQL..."

#ensure db is up
docker compose -f "$COMPOSE_FILE" up -d

# Get PostgreSQL container ID from Compose
DB_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q postgres)

if [ -z "$DB_CONTAINER" ]; then
    echo "ERROR: PostgreSQL container not found!"
    exit 1
fi

echo "Waiting for PostgreSQL..."

until docker exec "$DB_CONTAINER" \
    pg_isready -U "$DATABASE_USER" -d postgres; 
    do echo "PostgreSQL is not ready. Retrying..."
    sleep 2 
done

echo "PostgreSQL is ready."

# Check whether the database exists
echo "Checking database: $DATABASE_NAME"

DB_EXISTS=$(docker exec \
    -e PGPASSWORD="$DATABASE_PASSWORD" \
    "$DB_CONTAINER" \
    psql -U "$DATABASE_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DATABASE_NAME'")

# Create database if missing
if [ "$DB_EXISTS" != "1" ]; then
    echo "ERROR: Migration not initialized"
    exit 1
fi

echo "Database is ready."


echo "Running migrations..."
# Construct SQLx connection string
export DATABASE_URL="postgres://${DATABASE_USER}:${DATABASE_PASSWORD}@localhost:${DATABASE_PORT}/${DATABASE_NAME}"

# --- Ensure sqlx-cli is installed -----------------------------------------
if ! command -v sqlx >/dev/null 2>&1; then
    echo "sqlx not found — installing sqlx-cli..."

    if command -v cargo >/dev/null 2>&1; then
        # Preferred: install via cargo (no root needed, goes to ~/.cargo/bin)
        cargo install sqlx-cli --no-default-features --features rustls,postgres
    else
        echo "ERROR: neither 'sqlx' nor 'cargo' is available." >&2
        echo "Install Rust (https://rustup.rs) and re-run, or install sqlx-cli manually:" >&2
        echo "  https://github.com/launchbadge/sqlx/tree/main/sqlx-cli" >&2
        exit 1
    fi

    # cargo installs into ~/.cargo/bin, which may not be on PATH in this shell yet
    if ! command -v sqlx >/dev/null 2>&1; then
        export PATH="$HOME/.cargo/bin:$PATH"
    fi

    if ! command -v sqlx >/dev/null 2>&1; then
        echo "ERROR: sqlx-cli installation finished but 'sqlx' is still not on PATH." >&2
        echo "Add \$HOME/.cargo/bin to your PATH and re-run." >&2
        exit 1
    fi

    echo "sqlx-cli installed: $(sqlx --version)"
fi

sqlx migrate run

echo "Migrations initialized"

echo "Starting application..."
cargo run