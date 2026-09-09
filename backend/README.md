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

Accounts share chores, manually added shopping items, and Catalog stock quantities. Work, todo lists, projects,
project-generated shopping purchases (including history), card colors, and navigation preferences belong to the
signed-in account. Migration `0008_multi_user.sql` assigns existing personal records to the first registered user.
The API sets the authenticated user inside each database transaction; row security and composite foreign keys
enforce ownership. Browser drafts are also stored separately for each account.

After deploying the migration and API, provision another account on the Pi:

```sh
docker exec todo-catalog-api node scripts/create-user.mjs second "Second user"
```

This creates the account in the database and prints a setup code that expires after 24 hours. For an existing
username it issues a replacement code for that account, invalidating any earlier unused code. The recipient selects
**I have a setup code** on the sign-in screen and creates their passkey. A code is consumed only when passkey
registration succeeds; it cannot register a second credential afterward. Existing users can add more passkeys from
their signed-in profile menu.

Open apps refresh shared data every five seconds and when returning to the tab. Independent edits merge on revision
conflicts; incompatible changes to the same field stay in the existing local-draft recovery flow.
