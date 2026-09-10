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
