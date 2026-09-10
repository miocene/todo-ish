# Data integrity and recovery

## Supply purchases

Project-generated purchases belong to their account. Checking a shortage creates a unique purchase ID. The API records that ID and adjusts shared stock in the same transaction as the shopping update. Retrying that purchase cannot add stock twice. Moving a completed purchase into history keeps its stock; unchecking reverses it, removing at most the stock still available. Checking it again creates a new purchase ID.

Migration `0010_atomic_purchases.sql` records existing purchases without changing stock. Deploy the API migration with the matching frontend. Older clients receive a reload message when saving shopping changes, preventing them from also submitting a separate stock adjustment.

Database coverage includes concurrent purchases by two accounts, retrying an acknowledged purchase, reversal after consumption, and complete rollback when a stock limit rejects a purchase. Run `TEST_DATABASE_URL=... yarn test:integration` against a disposable PostgreSQL instance.
