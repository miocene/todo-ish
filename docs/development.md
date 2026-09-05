# Development data and checks

New accounts start with empty task collections and inventories. Existing saved data and pending local edits are preserved.

To populate **uninitialized resources** with sample tasks/projects/inventory, explicitly set `VITE_DEMO_DATA=true` in `.env.local` and start the development server. Use this only with a disposable development database: samples use the same save API as edits. This flag is ignored by production builds, and the fixture module is excluded from their bundle. Browser tests enable it against their isolated API mock.

Development mock colors still work with the older API. This change does not apply any database migration.

Run `yarn setup` once to install frontend and API dependencies, Python tools, and the Chromium browser used by tests. Node.js 22+, Yarn, and Python 3.12+ must already be installed. On Linux, `yarn setup --with-deps` also installs Chromium's system dependencies; CI uses this command.

Use `yarn dev` to start development, `yarn lint` to check JavaScript/Vue, CSS, and Python, and `yarn format` to format the repository. Run `yarn quality` for linting, formatting checks, tests, and the production build. The unit, API, browser, and database integration suites remain available individually.

## PostgreSQL integration tests

`TEST_DATABASE_URL=postgres://… yarn test:integration` runs the real migrations and repository against a **disposable PostgreSQL instance**. The account must be able to create databases and roles. The suite creates a uniquely named database and runtime role, tests with the migration's runtime grants, and removes both afterwards. It never migrates the database named in the connection URL.

These checks cover all resource round trips, date/timezone preservation, revision races, transaction rollback, nested ordering, and deletion. The command fails with a setup message when `TEST_DATABASE_URL` is missing. CI supplies a temporary PostgreSQL service; the ordinary API unit suite needs no database. Do not point this command at the live Pi.

## CI and deployment

Pull requests run the reusable quality workflow: linting, formatting, unit/API/browser tests, production build, PostgreSQL integration tests, and the web container build. The Pages deployment calls the same workflow and waits for it to pass before building or publishing an artifact. Workflow files are committed locally; they run only after a future push or manual dispatch.
