# Data integrity and recovery

## Supply purchases

Project-generated purchases belong to their account. Checking a shortage creates a unique purchase ID. The API records that ID and adjusts shared stock in the same transaction as the shopping update. Retrying that purchase cannot add stock twice. Moving a completed purchase into history keeps its stock; unchecking reverses it, removing at most the stock still available. Checking it again creates a new purchase ID.

Migration `0010_atomic_purchases.sql` records existing purchases without changing stock. Deploy the API migration with the matching frontend. Older clients receive a reload message when saving shopping changes, preventing them from also submitting a separate stock adjustment.

Database coverage includes concurrent purchases by two accounts, retrying an acknowledged purchase, reversal after consumption, and complete rollback when a stock limit rejects a purchase. Run `TEST_DATABASE_URL=... yarn test:integration` against a disposable PostgreSQL instance.

## Adapter and compatibility boundary

`app-data-contract.mjs` owns resource names, empty values, wire paths and legacy browser keys. `page-tasks.js` normalizes page models and explicitly requests initialization/migration; ordinary `readAppData()` and Activity snapshot reads do not migrate data. Work's `checkedAt` adapter stays at the wire boundary.

The following compatibility paths remain supported until their data population is known to be retired:

- Older development API colors: development builds only, in `app-data.js`.
- Older filament shapes and chore-rule strings: page normalization; existing browser data still needs these readers.
- v1 pending drafts: `pending-storage.js`, restricted to the original account, preserving recovery downloads.
- WebAuthn JSON helpers: `passkeys.js` imports `webauthn-polyfills`; removing these requires confirming the supported clients implement those helpers.

Do not remove stored values or compatibility readers merely because a new account starts with the current format.

## Resource capacity

The browser requests active data plus history pages of at most 500 entries. Every page carries its resource revision; if that resource changes during loading, the browser restarts the snapshot (up to three attempts). The current Activity UI still collects history in memory; transport paging does not imply virtualized rendering.

Modern saves use `x-history-mode: patch-v1`: the active resource plus history upserts/removals, with `If-Match` guarding the whole transaction. Unchanged history is never written. Limit each save to 2,000 changed history entries and 8 MiB of UTF-8 JSON. These limits apply in addition to field and collection limits; 2,000 maximum-length multilingual Work titles fit. Oversized or invalid drafts remain recoverable. Large imports use the operator recovery tool below, which writes validated snapshots directly in a database transaction. Legacy full-snapshot clients remain readable; their saves have the same byte limit.

Tests exercise 100,000-entry history differences, multilingual payload sizes, PostgreSQL pagination across all history resources, stale revisions, and completion/deletion recovery in the browser.

## Authentication housekeeping

The API cleans at most 500 expired challenges, sessions and setup codes per table at startup and once per minute, without overlapping cleanup runs. Valid sessions refresh `last_seen_at` at most every five minutes; expiry remains fixed. No credentials or unexpired setup codes are removed by cleanup.

Authentication POST requests share a burst of 20, a refill of 30 per minute and four concurrent requests per API process, with a bounded socket-address map. Caddy clients share the allowance; arbitrary forwarded headers cannot bypass it. Limited responses carry `429` and `Retry-After`. Ordinary authenticated data reads and session checks are outside this limiter. Authentication JSON bodies have a separate 64 KiB cap.

## Account export and reviewed import

On Activity, **Download saved data** exports version 1 of `done-ish-data`. It includes the signed-in account's Work, Todo lists, projects, colors, navigation preferences and project purchases, plus household chores, manual shopping and inventories. Private and shared resources occupy separate groups, with the source account ID recorded. It includes saved history; unsaved edits still use **Download local edits**. Credentials, passkeys and managed catalog definitions belong to the full database backup, not this application-data format.

The operator tool supports export, a read-only preview and transactional apply. It uses `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD_FILE`, as the API does. The connection must be able to assume `todo_runtime` (or `DATA_RUNTIME_ROLE`); superuser and RLS-bypassing runtime roles are rejected. Provision the target account first. With the database environment already configured, run from the repository root:

```sh
node backend/api/scripts/data-transfer.mjs export --username vadik --file vadik-data.json
node backend/api/scripts/data-transfer.mjs preview --username vadik --file vadik-data.json --plan vadik-plan.json
# Read the summary and the plan before applying it.
node backend/api/scripts/data-transfer.mjs apply --username vadik --plan vadik-plan.json
```

Export and preview create new files with mode 0600 and refuse to overwrite existing files. Preview defaults to `--mode merge`: incoming IDs win and unrelated current items remain. Use `--mode replace` for an exact replacement of the selected scope. Private data is the default scope; `--include-shared` explicitly includes household data. `--allow-account-remap` permits importing another account's export into the selected, already provisioned account. Review that choice before applying the plan.

Apply validates every resource before writing and checks all planned revisions under transaction locks. If any selected resource changed after preview, generate and review a fresh plan. Invalid data, stale revisions or a database failure leave the entire import unapplied. Row-level security preserves other accounts' private data. Imported purchase history does not add stock again; shared inventory changes require `--include-shared`. Migration `0011_account_restore_permissions.sql` permits replacement of the importing user's color records under their existing forced row-level policy.

On the Pi, a one-off container can reuse the API service's database environment and secrets. Use a host directory for recovery files so large exports are not constrained by the running container's 16 MiB temporary filesystem. For the default release directory, with `PUBLIC_API_BIND_ADDRESS` already set to the Pi's LAN address:

```sh
export TODO_APP_BUILD_CONTEXT="$HOME/todo-app/current"
mkdir -p "$HOME/todo-recovery"
chmod 700 "$HOME/todo-recovery"
transfer() {
  docker compose -f /opt/todo-db/compose.yaml \
    -f "$TODO_APP_BUILD_CONTEXT/backend/deploy/raspberry-pi/compose.services.yaml" \
    run --rm --no-deps --user "$(id -u):$(id -g)" \
    -v "$HOME/todo-recovery:/recovery" catalog-api node scripts/data-transfer.mjs "$@"
}
transfer export --username vadik --file /recovery/vadik-data.json
transfer preview --username vadik --file /recovery/vadik-data.json --plan /recovery/vadik-plan.json
# Review $HOME/todo-recovery/vadik-plan.json before running this:
transfer apply --username vadik --plan /recovery/vadik-plan.json
```

## Original browser data

Legacy import now retains the original localStorage keys and an account-owned archive of their raw values. Neither initialization nor save acknowledgement deletes them. Activity offers **Download old browser data** to the original importing account, including raw values when parsing or archive storage fails. The download is recovery evidence; it is separate from the validated `done-ish-data` format used by the operator importer.

Keep those originals for at least the runbook's one-week verification period. There is no automatic expiry: only clear them manually after verifying the imported app and saving a separate download. The real-browser integration test imports old Work, Todo, filament and chore formats into disposable PostgreSQL, verifies stored values, and downloads both the retained originals and saved account data.
