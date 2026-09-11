#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

yarn install --frozen-lockfile
yarn --cwd backend/api install --frozen-lockfile
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
yarn playwright install "$@" chromium
git config --local core.hooksPath .githooks
