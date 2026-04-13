#!/usr/bin/env bash
set -e

# Limpeza automática ao invés de apenas 'kill 0'
cleanup() {
    echo ""
    echo "Parando os containers de apoio (Postgres e Keycloak)..."
    docker compose stop postgres keycloak
    
    echo "Encerrando Quarkus e React..."
    kill 0
}

trap 'cleanup' EXIT

echo "Subindo o Banco de Dados e o Keycloak localmente via Docker..."
# Repare que NÃO estamos subindo o 'backend', apenas os serviços de apoio!
docker compose up -d postgres keycloak

echo "Starting backend (Quarkus em porta 8080)..."
(cd backend && ./mvnw quarkus:dev) &

echo "Starting frontend (React localmente)..."
(cd frontend && npm run dev) &

wait
