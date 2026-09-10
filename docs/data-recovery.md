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

Modern saves use `x-history-mode: patch-v1`: the active resource plus history upserts/removals, with `If-Match` guarding the whole transaction. Unchanged history is never written. Limit each save to 2,000 changed history entries and 8 MiB of UTF-8 JSON. These limits apply in addition to field and collection limits; 2,000 maximum-length multilingual Work titles fit. Oversized or invalid drafts remain recoverable. Large legacy imports must be divided into these bounded changes through recovery tooling rather than silently truncated. Legacy full-snapshot clients remain readable; their saves have the same byte limit.

Tests exercise 100,000-entry history differences, multilingual payload sizes, PostgreSQL pagination across all history resources, stale revisions, and completion/deletion recovery in the browser.

## Authentication housekeeping

The API cleans at most 500 expired challenges, sessions and setup codes per table at startup and once per minute, without overlapping cleanup runs. Valid sessions refresh `last_seen_at` at most every five minutes; expiry remains fixed. No credentials or unexpired setup codes are removed by cleanup.

Authentication POST requests share a burst of 20, a refill of 30 per minute and four concurrent requests per API process, with a bounded socket-address map. Caddy clients share the allowance; arbitrary forwarded headers cannot bypass it. Limited responses carry `429` and `Retry-After`. Ordinary authenticated data reads and session checks are outside this limiter. Authentication JSON bodies have a separate 64 KiB cap.
