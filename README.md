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

Setup installs frontend/API dependencies, Python tools, and Chromium. On Linux, use `yarn setup --with-deps` for Chromium's system dependencies.

`yarn dev` uses the project's local backend connection. Before running it, follow `local-notes/DEPLOYMENT.md` if available; it explains which database receives edits. Browser tests use an isolated API mock.

## Checks and configuration

| Command             | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `yarn lint`         | JavaScript/Vue, CSS, and Python checks                     |
| `yarn format`       | Format the repository                                      |
| `yarn format:check` | Check formatting without changing files                    |
| `yarn test:unit`    | Unit tests and repository audit                            |
| `yarn test:api`     | API tests without a database                               |
| `yarn test:e2e`     | Browser tests                                              |
| `yarn build`        | Production frontend build                                  |
| `yarn build:pages`  | Frontend build with Pages route handling                   |
| `yarn quality`      | Lint, formatting checks, unit/API/browser tests, and build |

Rules live in `eslint.config.js`, `stylelint.config.js`, `.prettierrc.json`, and `backend/pyproject.toml`. The [quality policy](AGENTS.md#quality-policy) explains which findings block checks. Browser settings live in `playwright.config.js`; commands are defined in `package.json` and `backend/api/package.json`.

CI runs [the reusable quality workflow](.github/workflows/quality.yml) before publishing. Backend integration and infrastructure checks are documented locally.

## Frontend structure

- `src/pages/`: application pages.
- `src/components/`: reusable Vue components and their CSS.
- `src/app/`: application state, API access, and shared utilities.
- `styles/`: global styles and design tokens.
- `tests/`: browser and frontend unit coverage.

## Card colors

`styles/card-colors.css`, imported by `styles/style.css`, owns the 42 shuffled backgrounds. Keep their numbering stable: a card's `color: 7` becomes `--color: var(--color-7)` on `JMCard`. Palette data migration and catalog maintenance are documented in `local-notes/DEPLOYMENT.md`.

## Performance checks

Use `node tools/benchmark-edits.mjs` for draft serialization and `node tools/benchmark-catalog.mjs` for catalog projections. `tests/catalog-performance.spec.js` measures browser behavior. Re-run the relevant check when changing those paths; local timings are not production guarantees.
