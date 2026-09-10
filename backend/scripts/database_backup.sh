#!/bin/sh
set -eu
umask 077
if [ "$#" -gt 1 ]; then echo 'Usage: database_backup.sh [DIRECTORY]' >&2; exit 2; fi
location=${1:-/var/backups/todo-db}
container=${DB_CONTAINER:-todo-postgres}
database=${DB_NAME:-todo}
database_user=${DB_USER:-todo_app}
mode=${PGTOOLS_MODE:-docker}
case "$mode" in local|docker) ;; *) echo 'PGTOOLS_MODE must be local or docker' >&2; exit 2;; esac
pgtool() {
  if [ "$mode" = docker ]; then docker exec -i "$container" "$@"; else "$@"; fi
}
if [ "$mode" = docker ]; then
  mountpoint -q "${DB_DATA_MOUNT:-/srv/pissd}" || { echo 'PostgreSQL storage is not mounted' >&2; exit 1; }
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy ] || { echo 'PostgreSQL is not healthy' >&2; exit 1; }
fi
mkdir -p "$location"
chmod 700 "$location"
exec 8>"$location/.backup.lock"
if command -v flock >/dev/null 2>&1; then flock -n 8 || { echo 'A backup is already running' >&2; exit 1; }; fi
temporary=$(mktemp "$location/.todo.dump.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM
pgtool pg_dump -U "$database_user" -d "$database" --format=custom --no-owner --no-acl > "$temporary"
test -s "$temporary"
pgtool pg_restore --list < "$temporary" > /dev/null
mv -f "$temporary" "$location/todo.dump"
printf '%s\n' "$location/todo.dump"
