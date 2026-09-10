# Deployment and recovery

## Reproducible Pi releases

`yarn deploy:pi` stages the exact `HEAD` commit using the committed allowlist in `tools/deploy-source.txt`. Ignored notes, untracked files and working-tree edits cannot enter the artifact. Each release lives in `~/todo-app/releases/<commit>` (or `PI_APP_DIR/releases/<commit>`). The deployment lock prevents simultaneous activations. A failed build or migration leaves the current-release marker unchanged; previous source remains available. The existing `/opt/todo-db` Compose configuration and `/etc/todo-db` secrets stay outside releases.

Set `PI_SSH_TARGET`, `PI_LAN_ADDRESS` and optionally `PI_APP_DIR`. No production host is contacted by the quality or database integration tests.

The migration service uses the same Node/pg image as the API and one PostgreSQL connection. A database advisory lock spans the whole run; each migration and its ledger entry commit together. Applied migration filenames and SHA-256 checksums are verified before any new SQL runs. Missing or changed applied files stop the run. Never edit deployed SQL; add a new migration.

On the first deployment from the older filename-only runner, review the existing SQL against the deployed source and set `PI_ADOPT_LEGACY_CHECKSUMS=1` for that deployment. This records checksums for the reviewed historical files; it cannot retroactively prove their original bytes. Subsequent runs reject changed checksums even with the adoption option. A manually initialized catalog schema also requires explicit adoption and all four catalog tables.

`current` changes only after API health, anonymous-session and protected-data checks plus web health succeed. `previous` records the prior successful release. To roll back application code, use that release as `TODO_APP_BUILD_CONTEXT` with its Compose files and rebuild/start `catalog-api`, `web` and `public-api`. Check API `/healthz`, `/api/auth/session`, anonymous `/api/data` = 401, and web `/healthz` again. Review migration compatibility first: application rollback does not undo database migrations. Keep the pre-deployment database dump for a separately planned data restore.

## Quality and supported runtimes

Node 22.22.1+ and 24.19.0+ are supported within their respective major versions. CI runs quality and disposable PostgreSQL tests on both, then builds both Docker images on Node 24.19.0 and starts the actual API image against a disposable migrated database. The image check verifies health, anonymous session state, and denial of protected data.

Pi deployment requires Node, Yarn, Git, tar, SSH and rsync locally; Docker Compose, curl and flock on the Pi. It rejects a dirty tree, runs `yarn quality`, and verifies the commit/tree did not change during checks before staging or remote mutation. First install dependencies with `yarn setup`. Database runner integration is tested in CI; it never targets the Pi.

Both web paths remain supported: Pages hosts the public frontend, and the Pi web container serves a local operational copy on loopback port 4173. Pages deployment runs the reusable quality workflow and publishes the matching Pages build. Verify the public app loads, authenticates and reads the protected API after publishing. To roll back Pages, redeploy a previously passing commit through its workflow; check that its API contract is compatible with the deployed backend. Pi web rollback follows the release instructions above.

Docker is not required to run the local frontend quality suite. When Docker is unavailable locally, the container builds and image smoke test must pass in CI before using the release in production.

## Backups through your existing Pi backup

Use your existing Pi backup for storage and retention. If it already captures a consistent snapshot of all PostgreSQL files, or backs them up with PostgreSQL stopped, another database backup job is optional. Ordinary file copying while PostgreSQL runs needs a consistent database dump instead; see [PostgreSQL's backup guidance](https://www.postgresql.org/docs/18/backup-file.html).

The small `backend/scripts/database_backup.sh` creates `/var/backups/todo-db/todo.dump`. Include that file in your existing Pi backup along with the usual host configuration and secrets. Each successful run replaces the file atomically; a failed dump keeps the previous copy. The directory is private (0700), the file is private (0600), and PostgreSQL checks the archive before it is published. There are no monthly copies, checksum sidecar files or restore reports. Older backup files are left alone.

Run the dump immediately before your existing backup, if it supports a pre-backup command. Otherwise, the existing daily timer can run it around 03:15 Amsterdam time. To install or update it on the Pi from the repository or a release directory:

```sh
sudo install -m 0750 backend/scripts/database_backup.sh /usr/local/sbin/backup-todo-db
sudo install -m 0644 backend/deploy/raspberry-pi/todo-db-backup.service /etc/systemd/system/
sudo install -m 0644 backend/deploy/raspberry-pi/todo-db-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now todo-db-backup.timer
sudo systemctl start todo-db-backup.service
```

To run it manually, use `sudo /usr/local/sbin/backup-todo-db`. Deployment uses the same script with a different directory to keep the most recent pre-migration copy at `PI_APP_DIR/backups/todo.dump`.

To check a recovered dump once, restore it into a temporary database on the Pi and inspect its data:

```sh
restore_db="todo_restore_check_$(date +%s)_$$"
docker exec todo-postgres createdb -U todo_app --template=template0 "$restore_db"
sudo cat /var/backups/todo-db/todo.dump | docker exec -i todo-postgres \
  pg_restore -U todo_app --dbname="$restore_db" --no-owner --no-privileges \
  --single-transaction --exit-on-error
docker exec todo-postgres psql -U todo_app -d "$restore_db" \
  -c 'SELECT count(*) FROM auth_users; SELECT count(*) FROM work_tasks;'
docker exec todo-postgres dropdb -U todo_app "$restore_db"
```

This check does not replace the live database. The integration test verifies an actual dump/restore, replacement with newer data, file permissions, and preservation of the last good dump after a failure. No recurring restore drill or SSD upgrade is required to use this setup. Account JSON export/import in `docs/data-recovery.md` remains an optional manual tool.
