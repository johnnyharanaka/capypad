#!/usr/bin/env bash
set -e

trap 'kill 0' EXIT

echo "Starting backend (Quarkus)..."
(cd backend && ./mvnw quarkus:dev) &

echo "Starting frontend (React)..."
(cd frontend && npm run dev) &

wait
