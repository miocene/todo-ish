#!/bin/sh
set -eu
umask 077
operation=${1:-backup}
location=${2:-/var/backups/todo-db}
container=${DB_CONTAINER:-todo-postgres}
database=${DB_NAME:-todo}
database_user=${DB_USER:-todo_app}
mode=${PGTOOLS_MODE:-docker}
case "$mode" in local|docker) ;; *) echo 'PGTOOLS_MODE must be local or docker' >&2; exit 2;; esac
pgtool() {
  if [ "$mode" = docker ]; then docker exec -i "$container" "$@"; else "$@"; fi
}
prune() {
  pattern=$1
  keep=$2
  for file in "$location"/$pattern; do
    [ -f "$file" ] && basename "$file"
  done | sort -r | awk -v keep="$keep" 'NR > keep' | while IFS= read -r name; do
    rm -f "$location/$name" "$location/$name.sha256" "$location/$name.restore-check.txt"
  done
}
case "$operation" in
backup)
  if [ "$mode" = docker ]; then
    mountpoint -q "${DB_DATA_MOUNT:-/srv/pissd}" || { echo 'PostgreSQL storage is not mounted' >&2; exit 1; }
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy ] || { echo 'PostgreSQL is not healthy' >&2; exit 1; }
  fi
  mkdir -p "$location"
  chmod 700 "$location"
  exec 8>"$location/.backup.lock"
  if command -v flock >/dev/null 2>&1; then flock -n 8 || { echo 'A backup is already running' >&2; exit 1; }; fi
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="todo-daily-$stamp-$$.dump"
  temporary="$location/.$name.partial"
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  pgtool pg_dump -U "$database_user" -d "$database" --format=custom --no-owner --no-acl > "$temporary"
  test -s "$temporary"
  pgtool pg_restore --list < "$temporary" > /dev/null
  hash=$(sha256sum "$temporary" | cut -d ' ' -f 1)
  printf '%s  %s\n' "$hash" "$name" > "$location/$name.sha256"
  mv "$temporary" "$location/$name"
  monthly="todo-monthly-$(date -u +%Y%m).dump"
  if [ ! -e "$location/$monthly" ]; then
    printf '%s  %s\n' "$hash" "$monthly" > "$location/$monthly.sha256"
    ln "$location/$name" "$location/$monthly"
  fi
  prune 'todo-daily-*.dump' 90
  prune 'todo-monthly-*.dump' 12
  printf '%s\n' "$location/$name"
  ;;
verify)
  test -s "$location" && test -s "$location.sha256"
  expected=$(cut -d ' ' -f 1 "$location.sha256")
  actual=$(sha256sum "$location" | cut -d ' ' -f 1)
  [ "$actual" = "$expected" ] || { echo 'Backup checksum mismatch' >&2; exit 1; }
  restore_database="todo_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
  created=false
  cleanup() { if [ "$created" = true ]; then pgtool dropdb -U "$database_user" --if-exists "$restore_database"; fi; }
  trap cleanup EXIT HUP INT TERM
  pgtool createdb -U "$database_user" --template=template0 "$restore_database"
  created=true
  pgtool pg_restore -U "$database_user" --dbname="$restore_database" --exit-on-error --single-transaction --no-owner --no-privileges < "$location"
  report="$location.restore-check.txt.partial"
  trap 'rm -f "$report"; cleanup' EXIT HUP INT TERM
  {
    printf 'Verified UTC: %s\nSHA-256: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$actual"
    pgtool psql -X -q -v ON_ERROR_STOP=1 -U "$database_user" -d "$restore_database" -At <<'SQL'
SELECT format('SELECT %L || count(*) FROM %I.%I;', tablename || '=', schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
\gexec
SQL
  } > "$report"
  pgtool dropdb -U "$database_user" "$restore_database"
  created=false
  mv "$report" "$location.restore-check.txt"
  cat "$location.restore-check.txt"
  ;;
*) echo 'Usage: database_backup.sh backup DIRECTORY | verify DUMP_FILE' >&2; exit 2;;
esac
