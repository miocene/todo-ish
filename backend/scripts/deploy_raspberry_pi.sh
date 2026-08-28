#!/bin/sh

set -eu

ssh_target=${PI_SSH_TARGET:-}
remote_directory=${PI_APP_DIR:-todo-app}
public_api_bind_address=${PI_LAN_ADDRESS:-192.168.178.13}

case "$ssh_target" in
  "" | -* | *[!A-Za-z0-9._@:%-]*)
    echo "PI_SSH_TARGET must be set to a safe SSH destination such as user@todo-pi.local" >&2
    exit 2
    ;;
esac

case "$remote_directory" in
  "" | /* | *..* | *[!A-Za-z0-9._/-]*)
    echo "PI_APP_DIR must be a safe relative path inside the remote user's home directory" >&2
    exit 2
    ;;
esac

case "$public_api_bind_address" in
  "" | *[!0-9.]* | .* | *. | *..*)
    echo "PI_LAN_ADDRESS must be the Pi's IPv4 LAN address" >&2
    exit 2
    ;;
esac

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compose_command="docker compose -f /opt/todo-db/compose.yaml -f $remote_directory/backend/deploy/raspberry-pi/compose.services.yaml -f $remote_directory/backend/deploy/raspberry-pi/compose.web.yaml"
remote_base_directory=$(ssh "$ssh_target" pwd)
remote_build_context="$remote_base_directory/$remote_directory"
compose_environment="TODO_APP_BUILD_CONTEXT=$remote_build_context PUBLIC_API_BIND_ADDRESS=$public_api_bind_address"
backup_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_directory="$remote_directory/backups"
backup_file="$backup_directory/todo-before-deploy-$backup_timestamp.dump"

rsync \
  --archive \
  --compress \
  --exclude .git \
  --exclude .env \
  --exclude '.env.*' \
  --exclude .npmrc \
  --exclude .venv \
  --exclude '*credentials*.json' \
  --exclude dist \
  --exclude id_ecdsa \
  --exclude id_ed25519 \
  --exclude id_rsa \
  --exclude node_modules \
  --exclude playwright-report \
  --exclude secrets \
  --exclude 'service-account*.json' \
  --exclude test-results \
  --exclude '*.key' \
  --exclude '*.p12' \
  --exclude '*.pem' \
  --exclude '*.pfx' \
  "$repository_root/" "$ssh_target:$remote_directory/"

ssh "$ssh_target" "$compose_environment $compose_command config --quiet"
ssh "$ssh_target" "$compose_environment $compose_command build catalog-api web"
ssh "$ssh_target" "mkdir -p $backup_directory && docker exec todo-postgres pg_dump -U todo_app -d todo --format=custom > $backup_file && test -s $backup_file"
echo "Database backup created at $ssh_target:$backup_file"
ssh "$ssh_target" "$compose_environment $compose_command run --rm migrate"
ssh "$ssh_target" "$compose_environment $compose_command up -d --no-build --wait --wait-timeout 300 catalog-api web public-api"
ssh "$ssh_target" "$compose_environment $compose_command ps catalog-api web public-api"
ssh "$ssh_target" "curl --fail --silent --show-error http://127.0.0.1:4173/healthz >/dev/null"
ssh "$ssh_target" "curl --fail --silent --show-error http://127.0.0.1:3000/healthz >/dev/null"
ssh "$ssh_target" "curl --fail --silent --show-error http://127.0.0.1:3000/api/auth/session >/dev/null"
ssh "$ssh_target" "test \"\$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/api/data)\" = 401"

echo "The protected API is listening locally on the Pi at http://127.0.0.1:3000"
echo "Caddy will publish https://api.todo-ish.today after DNS points to this connection and router ports 80/443 reach the Pi."
