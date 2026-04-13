#!/bin/bash
# Cria um usuário admin no CapyPad via SSH.
#
# Uso: ./scripts/create-admin.sh <container-name> <username> <password>
#
# Exemplo:
#   ./scripts/create-admin.sh capypad-backend joao minhasenha
#
# O script para o container, sobe um temporário em modo setup, e reinicia.
# Requer ~30 segundos de downtime.

set -e

CONTAINER="${1:-capypad-backend}"
USERNAME="$2"
PASSWORD="$3"

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    echo "Uso: $0 <container-name> <username> <password>"
    exit 1
fi

IMAGE=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER" 2>/dev/null)
if [ -z "$IMAGE" ]; then
    echo "Container '$CONTAINER' não encontrado."
    exit 1
fi

echo "[capypad] Parando container '$CONTAINER'..."
docker stop "$CONTAINER"

echo "[capypad] Criando admin '$USERNAME'..."
docker run --rm \
    --volumes-from "$CONTAINER" \
    --env-file "$(dirname "$0")/../backend/.env.production" \
    -e ADMIN_SETUP=true \
    -e ADMIN_USERNAME="$USERNAME" \
    -e ADMIN_PASSWORD="$PASSWORD" \
    "$IMAGE"

echo "[capypad] Reiniciando container '$CONTAINER'..."
docker start "$CONTAINER"

echo "[capypad] Pronto! Admin '$USERNAME' criado."
