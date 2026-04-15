#!/usr/bin/env bash
set -euo pipefail

TOKEN=$(curl -s -X POST "http://localhost:8180/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Failed to obtain access token from Keycloak."
  exit 1
fi

echo "Got token in memory."

# Search user
USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8180/admin/realms/capypad/users?username=admin" | jq -r '.[0].id')
echo "User ID: $USER_ID"

# Get required actions
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8180/admin/realms/capypad/users/$USER_ID" | jq '.requiredActions'
