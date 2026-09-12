# GitHub Pages deployment

GitHub Pages serves the built Vue frontend. The application API is hosted separately; its infrastructure and operating instructions belong in ignored `local-notes/`.

## Publishing

[The Pages workflow](../.github/workflows/deploy-pages.yml) runs on pushes to `main` and can also be started manually with `workflow_dispatch`. It first calls [the quality workflow](../.github/workflows/quality.yml). Browser tests run in three parallel jobs, separately from the Node.js and backend checks. Deployment waits for every quality job to pass. After that succeeds, it runs `yarn build:pages`, uploads `dist/`, and publishes the artifact to the `github-pages` environment.

The build uses these public settings:

- `VITE_API_ORIGIN=https://api.todo-ish.today`
- `VITE_BASE_PATH=/`

Vite and Vue Router use the same base path. `tools/prepare_github_pages.mjs` copies the generated entry page to `404.html` for client-side history routes. Browser environment variables are public: never put credentials in them.

To check the Pages build locally:

```sh
yarn build:pages
```

Use the same environment settings as the workflow when comparing local output with the published site. Local success does not establish that CI or publishing succeeded.

## Verification and rollback

After publishing, verify the workflow's deployment URL, a direct application route, passkey sign-in, and authenticated API reads.

To roll back the frontend, redeploy a previously passing revision through the Pages workflow. Confirm that its API contract remains compatible with the running backend. A Pages deployment does not deploy or roll back the API or database.
