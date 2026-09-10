# Deployment and recovery

## Reproducible Pi releases

`yarn deploy:pi` stages the exact `HEAD` commit using the committed allowlist in `tools/deploy-source.txt`. Ignored notes, untracked files and working-tree edits cannot enter the artifact. Each release lives in `~/todo-app/releases/<commit>` (or `PI_APP_DIR/releases/<commit>`). The deployment lock prevents simultaneous activations. A failed build or migration leaves the current-release marker unchanged; previous source remains available. The existing `/opt/todo-db` Compose configuration and `/etc/todo-db` secrets stay outside releases.

Set `PI_SSH_TARGET`, `PI_LAN_ADDRESS` and optionally `PI_APP_DIR`. No production host is contacted by the quality or database integration tests.

The migration service uses the same Node/pg image as the API and one PostgreSQL connection. A database advisory lock spans the whole run; each migration and its ledger entry commit together. Applied migration filenames and SHA-256 checksums are verified before any new SQL runs. Missing or changed applied files stop the run. Never edit deployed SQL; add a new migration.

On the first deployment from the older filename-only runner, review the existing SQL against the deployed source and set `PI_ADOPT_LEGACY_CHECKSUMS=1` for that deployment. This records checksums for the reviewed historical files; it cannot retroactively prove their original bytes. Subsequent runs reject changed checksums even with the adoption option. A manually initialized catalog schema also requires explicit adoption and all four catalog tables.

`current` changes only after API health, anonymous-session and protected-data checks plus web health succeed. `previous` records the prior successful release. To roll back application code, use that release as `TODO_APP_BUILD_CONTEXT` with its Compose files and rebuild/start `catalog-api`, `web` and `public-api`. Check API `/healthz`, `/api/auth/session`, anonymous `/api/data` = 401, and web `/healthz` again. Review migration compatibility first: application rollback does not undo database migrations. Keep the pre-deployment database dump for a separately planned data restore.
