# Deployment and recovery

## Reproducible Pi releases

`yarn deploy:pi` stages the exact `HEAD` commit using the committed allowlist in `tools/deploy-source.txt`. Ignored notes, untracked files and working-tree edits cannot enter the artifact. Each release lives in `~/todo-app/releases/<commit>` (or `PI_APP_DIR/releases/<commit>`). The deployment lock prevents simultaneous activations. A failed build or migration leaves the current-release marker unchanged; previous source remains available. The existing `/opt/todo-db` Compose configuration and `/etc/todo-db` secrets stay outside releases.

Set `PI_SSH_TARGET`, `PI_LAN_ADDRESS` and optionally `PI_APP_DIR`. No production host is contacted by the quality or database integration tests.

The migration service uses the same Node/pg image as the API and one PostgreSQL connection. A database advisory lock spans the whole run; each migration and its ledger entry commit together. Applied migration filenames and SHA-256 checksums are verified before any new SQL runs. Missing or changed applied files stop the run. Never edit deployed SQL; add a new migration.

On the first deployment from the older filename-only runner, review the existing SQL against the deployed source and set `PI_ADOPT_LEGACY_CHECKSUMS=1` for that deployment. This records checksums for the reviewed historical files; it cannot retroactively prove their original bytes. Subsequent runs reject changed checksums even with the adoption option. A manually initialized catalog schema also requires explicit adoption and all four catalog tables.

`current` changes only after API health, anonymous-session and protected-data checks plus web health succeed. `previous` records the prior successful release. To roll back application code, use that release as `TODO_APP_BUILD_CONTEXT` with its Compose files and rebuild/start `catalog-api`, `web` and `public-api`. Check API `/healthz`, `/api/auth/session`, anonymous `/api/data` = 401, and web `/healthz` again. Review migration compatibility first: application rollback does not undo database migrations. Keep the pre-deployment database dump for a separately planned data restore.

## Quality and supported runtimes

Node 22.22.1+ and 24.19.0+ are supported within their respective major versions. CI runs quality and disposable PostgreSQL tests on both, then builds both Docker images on Node 24.19.0 and starts the actual API image against a disposable migrated database. The image check verifies health, anonymous session state, and denial of protected data.

Pi deployment requires Node, Yarn, Git, tar, SSH and rsync locally; Docker Compose, curl, flock and sha256sum on the Pi. It rejects a dirty tree, runs `yarn quality`, and verifies the commit/tree did not change during checks before staging or remote mutation. First install dependencies with `yarn setup`. Database runner integration is tested in CI; it never targets the Pi.

Both web paths remain supported: Pages hosts the public frontend, and the Pi web container serves a local operational copy on loopback port 4173. Pages deployment runs the reusable quality workflow and publishes the matching Pages build. Verify the public app loads, authenticates and reads the protected API after publishing. To roll back Pages, redeploy a previously passing commit through its workflow; check that its API contract is compatible with the deployed backend. Pi web rollback follows the release instructions above.

Docker is not required to run the local frontend quality suite. When Docker is unavailable locally, the container builds and image smoke test must pass in CI before using the release in production.

## Pi-local backups

The chosen destination is the Pi. The daily service keeps `/var/backups/todo-db` on the existing root filesystem; deployment keeps pre-migration copies in `PI_APP_DIR/backups`. The maintained `backend/scripts/database_backup.sh` uses directory mode 0700, file mode 0600, temporary files, archive validation and SHA-256 before publishing a dump. It retains 90 recent successful backups plus the first successful backup of each of the latest 12 months. Monthly copies use hard links. Older runbook filenames are left alone.

To update the existing daily service on the Pi from a reviewed release:

```sh
sudo install -m 0750 backend/scripts/database_backup.sh /usr/local/sbin/backup-todo-db
sudo install -m 0644 backend/deploy/raspberry-pi/todo-db-backup.service /etc/systemd/system/
sudo install -m 0644 backend/deploy/raspberry-pi/todo-db-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now todo-db-backup.timer
sudo systemctl start todo-db-backup.service
```

A restore drill checks the checksum, restores all objects/data in a single transaction with `pg_restore --exit-on-error`, reads every restored public table and writes a dated `.restore-check.txt` report. It creates and drops its own uniquely named temporary database; it never restores into `todo` and does not write a marker into the source database:

```sh
sudo /usr/local/sbin/backup-todo-db verify /var/backups/todo-db/todo-daily-REPLACE-WITH-ACTUAL-FILENAME.dump
```

Current local evidence (2026-09-10): a disposable PostgreSQL 18.4 instance, PostgreSQL 18.6 client tools, full current migrations and a multilingual Work record passed backup, restore, cleanup, 0600/0700 permissions, retention and corrupted-checksum rejection. CI runs the same drill using its PostgreSQL container. This verifies the tooling; installing it on the Pi and checking the SSD cable/USB3-UAS connection remain operational follow-ups. A Pi-local copy does not cover loss of the entire host; a second-device copy remains optional.
