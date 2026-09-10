#!/bin/sh
set -eu
# The runner keeps one PostgreSQL connection for locking, checksums and transactions.
runner_directory=$(CDPATH= cd -- "$(dirname -- "$0")/../api" && pwd)
exec node "$runner_directory/scripts/migrate.mjs"
