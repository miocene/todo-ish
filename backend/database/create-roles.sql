\set ON_ERROR_STOP on

BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'todo_owner') THEN
    CREATE ROLE todo_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'todo_migrator') THEN
    EXECUTE format(
      'CREATE ROLE todo_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L',
      regexp_replace(pg_read_file('/run/secrets/migrator_password'), E'[\\r\\n]+$', '')
    );
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'todo_runtime') THEN
    EXECUTE format(
      'CREATE ROLE todo_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L',
      regexp_replace(pg_read_file('/run/secrets/runtime_password'), E'[\\r\\n]+$', '')
    );
  END IF;
END
$roles$;

GRANT todo_owner TO todo_migrator
  WITH INHERIT FALSE, SET TRUE;

ALTER DATABASE todo OWNER TO todo_owner;

REVOKE CONNECT, TEMPORARY ON DATABASE todo FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE todo TO todo_migrator;
GRANT CONNECT ON DATABASE todo TO todo_runtime;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO todo_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE todo_owner
  IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES TO todo_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE todo_owner
  IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE
  ON SEQUENCES TO todo_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE todo_owner
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE todo_owner
  IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO todo_runtime;

ALTER ROLE todo_runtime IN DATABASE todo
  SET statement_timeout = '30s';

ALTER ROLE todo_runtime IN DATABASE todo
  SET lock_timeout = '5s';

ALTER ROLE todo_runtime IN DATABASE todo
  SET idle_in_transaction_session_timeout = '60s';

COMMIT;
