#!/usr/bin/env bash
set -e

# Automatic cleanup instead of relying only on 'kill 0'
cleanup() {
    echo ""
    echo "Stopping support containers (Postgres and Keycloak)..."
    docker compose stop postgres keycloak
    
    echo "Shutting down Quarkus and React..."
    kill 0
}

trap 'cleanup' EXIT

echo "Starting the database and Keycloak locally via Docker..."
# Note: we are NOT starting 'backend' here, only support services.
docker compose up -d postgres keycloak

echo "Starting backend (Quarkus on port 8080)..."
(cd backend && ./mvnw quarkus:dev) &

echo "Starting frontend (React locally)..."
(cd frontend && npm run dev) &

wait
