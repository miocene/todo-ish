# Done-ish

A personal task app with a Vue frontend and a separate application API.

- [GitHub Pages deployment](docs/deployment.md): publishing and checking the public frontend.
- [Assistant instructions](AGENTS.md): project rules for coding assistants.

Infrastructure and non-Pages operating notes are kept in ignored `local-notes/`. They are not included in a Git clone.

## Development

Use Node.js 22.22.1+ or 24.19.0+ within those major versions, Yarn 1.22, and Python 3.12+.

```sh
yarn setup
```

Setup installs frontend/API dependencies, Python tools, and Chromium/WebKit. On Linux, use `yarn setup --with-deps` for browser system dependencies.

Setup also enables `.githooks/pre-push`: every push runs `yarn lint`, `yarn format:check`, and `yarn test` (unit, API, and Chromium browser tests), stopping at the first failure. Formatting is checked without modifying files. Safari, mobile Safari, coverage, and PostgreSQL integration checks run in CI. The hook checks the current working tree; commit the changes you intend to push before running it.

`yarn dev` uses the project's local backend connection. Before running it, follow `local-notes/DEPLOYMENT.md` if available; it explains which database receives edits. Browser tests use an isolated API mock.

## Checks and configuration

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `yarn lint`         | JavaScript/Vue, CSS, and Python checks               |
| `yarn format`       | Format the repository                                |
| `yarn format:check` | Check formatting without changing files              |
| `yarn test:unit`    | Unit tests and repository audit                      |
| `yarn test:api`     | API tests without a database                         |
| `yarn test`         | Unit, API, and Chromium tests                        |
| `yarn test:e2e`     | Detailed Chromium tests + Safari smoke tests         |
| `yarn build`        | Production frontend build                            |
| `yarn build:pages`  | Frontend build with Pages route handling             |
| `yarn quality`      | Lint, formatting, unit/API/Chromium tests, and build |

Rules live in `eslint.config.js`, `stylelint.config.js`, `.prettierrc.json`, and `backend/pyproject.toml`. The [quality policy](AGENTS.md#quality-policy) explains which findings block checks. Browser settings live in `playwright.config.js`; commands are defined in `package.json` and `backend/api/package.json`.

Pages runs lint, formatting, unit/API tests, a build, and all three browser projects on Node 24. Full pull-request and manual [quality runs](.github/workflows/quality.yml) also check Node 22, coverage, database integration, and containers. Backend operating details are documented locally.

## Frontend structure

- `src/pages/`: application pages.
- `src/components/`: reusable Vue components, their CSS, and component-focused `ComponentName.spec.js` browser tests.
- `src/app/`: application state, API access, shared utilities, and adjacent `utility.unit.js` tests.
- `styles/`: global styles and design tokens.
- `tests/`: page flows, cross-component browser tests, shared fixtures, and repository/data-contract checks.

## Card colors

`styles/card-colors.css`, imported by `styles/style.css`, owns the 36 backgrounds. Renumbering requires a database migration: a card's `color: 7` becomes `--color: var(--color-7)` on `JMCard`. Palette data migration and catalog maintenance are documented in `local-notes/DEPLOYMENT.md`.

## Browser checks and coverage

`yarn test` uses Chromium for faster local and pre-push checks; coverage is run separately in CI. `yarn test:e2e` runs all browser scenarios in Chromium and only the core flows tagged `@smoke` in desktop WebKit and WebKit with iPhone emulation. These cover sign-in, navigation, task and project editing, purchases, save recovery, and opening Activity with a large history. Detailed data edge cases run once in Chromium; unit/API tests cover domain logic. Run one project with `yarn test:e2e --project=webkit`. Emulation does not replace checking a real iPhone, particularly native passkey prompts.

Tag an existing test with `{ tag: "@smoke" }` when it protects a core browser interaction; do not duplicate it in a separate suite. Avoid assertions about exact CSS geometry, internal DOM structure, or native input stepping. Keep tests focused on user-visible outcomes and saved data.

Component-focused browser tests use the shared app fixture; they run through the same Playwright command as page flows. Utility unit tests run through `yarn test:unit` and are excluded from coverage measurements.

`test-results/` contains disposable failure traces and runner state; it is ignored by Git. Tests do not generate routine screenshots without assertions.

`yarn test:coverage` reports coverage of JavaScript modules loaded by unit/API tests and writes `coverage/lcov.info`. It does not measure Vue templates, browser flows, or Python. Coverage is informational; there is no percentage gate. CI runs Chromium on Ubuntu and both Safari projects on macOS 15, in separate parallel jobs with two workers on Node 24. [WebKit features depend on the host OS](https://playwright.dev/docs/browsers#webkit), so the Safari jobs use Apple’s platform. Browser jobs do not retry failures and stop after three failures or eight minutes; failing browser jobs cancel their matrix siblings. Full PR/manual runs check both supported Node versions and collect coverage.

`tests/catalog-capacity.spec.js` verifies full catalogs and a ten-task project editor; `tests/activity.spec.js` covers a year with 2,000 history entries. These are functional capacity checks, not performance benchmarks.

Browser tests use `vite.test.config.js`, with fixed demo/API settings, no local environment files, and no backend proxy. Page modules are warmed before navigation. Failure artifacts include the HTML report, Playwright traces, and `browser-diagnostics` (page text, JavaScript errors, and failed requests). CI also prints browser diagnostics directly in the job log on failure. Advisory details remain in the report; console output prints one line per warning.
