#!/bin/sh
set -eu
umask 077
app_directory=$1
revision=$2
public_address=$3
case "$app_directory" in "" | /* | *..* | *[!A-Za-z0-9._/-]*) exit 2;; esac
case "$revision" in "" | *[!0-9a-f]*) exit 2;; esac
case "$public_address" in "" | *[!0-9.]*) exit 2;; esac
for tool in docker curl flock sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing Pi tool: $tool" >&2; exit 2; }
done
docker compose version >/dev/null
docker info >/dev/null
test -r /opt/todo-db/compose.yaml || { echo 'Missing Pi database Compose configuration' >&2; exit 2; }
release="$HOME/$app_directory/releases/$revision"
exec 9>"$HOME/$app_directory/.deploy.lock"
flock -n 9 || { echo 'Another Pi deployment is running' >&2; exit 1; }
export TODO_APP_BUILD_CONTEXT="$release" PUBLIC_API_BIND_ADDRESS="$public_address"
compose() {
  docker compose -f /opt/todo-db/compose.yaml \
    -f "$release/backend/deploy/raspberry-pi/compose.services.yaml" \
    -f "$release/backend/deploy/raspberry-pi/compose.web.yaml" "$@"
}
compose config --quiet
compose build catalog-api web migrate
backup_directory="$HOME/$app_directory/backups"
mkdir -p "$backup_directory"
chmod 700 "$backup_directory"
backup_file="$backup_directory/todo-before-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec todo-postgres pg_dump -U todo_app -d todo --format=custom > "$backup_file.partial"
test -s "$backup_file.partial"
docker exec -i todo-postgres pg_restore --list < "$backup_file.partial" > /dev/null
mv "$backup_file.partial" "$backup_file"
echo "Database backup: $backup_file"
compose run --rm migrate
compose up -d --no-build --wait --wait-timeout 300 catalog-api web public-api
curl --fail --silent --show-error http://127.0.0.1:4173/healthz > /dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/healthz > /dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/api/auth/session > /dev/null
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/api/data)" = 401
previous=$(readlink "$HOME/$app_directory/current" || true)
if [ -n "$previous" ]; then
  ln -sfn "$previous" "$HOME/$app_directory/previous.next"
  mv -Tf "$HOME/$app_directory/previous.next" "$HOME/$app_directory/previous"
fi
ln -sfn "releases/$revision" "$HOME/$app_directory/current.next"
mv -Tf "$HOME/$app_directory/current.next" "$HOME/$app_directory/current"
printf 'Active release: %s\n' "$revision"
