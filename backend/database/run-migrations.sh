#!/bin/sh

set -eu

migration_directory=${MIGRATION_DIRECTORY:-/migrations}
password_file=${PGPASSWORD_FILE:-}

if [ -z "$password_file" ] || [ ! -r "$password_file" ]; then
  echo "PGPASSWORD_FILE must point to a readable PostgreSQL password secret" >&2
  exit 2
fi

export PGPASSWORD
PGPASSWORD=$(sed -e 's/[[:space:]]*$//' "$password_file")

if [ -z "$PGPASSWORD" ]; then
  echo "The PostgreSQL migration password secret is empty" >&2
  exit 2
fi

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT schema_migrations_filename_not_blank CHECK (length(trim(filename)) > 0)
);

REVOKE ALL PRIVILEGES ON TABLE schema_migrations FROM todo_runtime;

DO $$
DECLARE
  catalog_table_count integer;
BEGIN
  SELECT count(*)::integer
  INTO catalog_table_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'filament_catalog_entries',
      'filament_catalog_snapshots',
      'floss_catalog_entries',
      'floss_catalog_snapshots'
    );

  IF catalog_table_count = 4 THEN
    INSERT INTO schema_migrations (filename)
    VALUES ('0000_catalogs.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSIF catalog_table_count <> 0 THEN
    RAISE EXCEPTION 'The catalog schema is incomplete (% of 4 tables)', catalog_table_count;
  END IF;
END
$$;
SQL

found_migration=false
for migration in "$migration_directory"/[0-9][0-9][0-9][0-9]_*.sql; do
  if [ ! -f "$migration" ]; then
    continue
  fi
  found_migration=true
  filename=${migration##*/}
  case "$filename" in
    *[!A-Za-z0-9_.-]*)
      echo "Unsafe migration filename: $filename" >&2
      exit 2
      ;;
  esac

  applied=$(psql -v ON_ERROR_STOP=1 -Atc "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '$filename')")
  if [ "$applied" = "t" ]; then
    echo "Already applied: $filename"
    continue
  fi

  echo "Applying: $filename"
  {
    printf 'BEGIN;\n'
    cat "$migration"
    printf "\nINSERT INTO schema_migrations (filename) VALUES ('%s');\nCOMMIT;\n" "$filename"
  } | psql -v ON_ERROR_STOP=1
done

if [ "$found_migration" = false ]; then
  echo "No migrations found in $migration_directory" >&2
  exit 2
fi
