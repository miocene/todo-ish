# Backend

Everything intended to run on, configure, or maintain the Raspberry Pi backend lives here.

- `api/` contains the Node.js HTTP API that reads PostgreSQL.
- `database/` contains the role bootstrap, Drizzle schema, migration runner, and SQL migrations.
- `catalogs/` contains the authoritative filament and floss source snapshots.
- `deploy/` contains Docker Compose and container configuration for the Raspberry Pi.
- `scripts/` contains catalog maintenance, deployment, and backend test utilities.
- `drizzle.config.ts`, `pyproject.toml`, and `requirements-dev.txt` configure backend tooling.

The Vue frontend remains at the repository root. Root package scripts provide the supported commands for both sides of the repository.

Deployments run `database/run-migrations.sh` before restarting the API. The runner records each SQL filename in
`schema_migrations`, applies every migration in a transaction, and recognizes the original manually installed catalogue
schema as the `0000_catalogs.sql` baseline. Before applying migrations, the deployment script writes a timestamped custom
PostgreSQL dump to `~/todo-app/backups/` on the Pi and verifies that the backup is not empty.
