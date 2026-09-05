# Development data and checks

New accounts start with empty task collections and inventories. Existing saved data and pending local edits are preserved.

To populate **uninitialized resources** with sample tasks/projects/inventory, explicitly set `VITE_DEMO_DATA=true` in `.env.local` and start the development server. Use this only with a disposable development database: samples use the same save API as edits. This flag is ignored by production builds, and the fixture module is excluded from their bundle. Browser tests enable it against their isolated API mock.

Development mock colors still work with the older API. This change does not apply any database migration.

Run `yarn quality` for linting, formatting, tests, and the production build. API dependencies live in `backend/api`; install them with `yarn --cwd backend/api install --frozen-lockfile`.

## PostgreSQL integration tests

`TEST_DATABASE_URL=postgres://… yarn test:integration` runs the real migrations and repository against a **disposable PostgreSQL instance**. The account must be able to create databases and roles. The suite creates a uniquely named database and runtime role, tests with the migration's runtime grants, and removes both afterwards. It never migrates the database named in the connection URL.

These checks cover all resource round trips, date/timezone preservation, revision races, transaction rollback, nested ordering, and deletion. The command fails with a setup message when `TEST_DATABASE_URL` is missing. CI supplies a temporary PostgreSQL service; the ordinary API unit suite needs no database. Do not point this command at the live Pi.
