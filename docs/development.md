# Development data and checks

New accounts start with empty task collections and inventories. Existing saved data and pending local edits are preserved.

To populate **uninitialized resources** with sample tasks/projects/inventory, explicitly set `VITE_DEMO_DATA=true` in `.env.local` and start the development server. Use this only with a disposable development database: samples use the same save API as edits. This flag is ignored by production builds, and the fixture module is excluded from their bundle. Browser tests enable it against their isolated API mock.

Development mock colors still work with the older API. This change does not apply any database migration.

Run `yarn quality` for linting, formatting, tests, and the production build. API dependencies live in `backend/api`; install them with `yarn --cwd backend/api install --frozen-lockfile`.
