# Backend

Everything intended to run on, configure, or maintain the Raspberry Pi backend lives here.

- `api/` contains the Node.js HTTP API that reads PostgreSQL.
- `database/` contains the Drizzle schema and SQL migrations.
- `catalogs/` contains the authoritative filament and floss source snapshots.
- `deploy/` contains Docker Compose and container configuration for the Raspberry Pi.
- `scripts/` contains catalog maintenance, deployment, and backend test utilities.
- `drizzle.config.ts`, `pyproject.toml`, and `requirements-dev.txt` configure backend tooling.

The Vue frontend remains at the repository root. Root package scripts provide the supported commands for both sides of the repository.
