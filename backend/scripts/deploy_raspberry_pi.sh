#!/bin/sh
set -eu
ssh_target=${PI_SSH_TARGET:-}
remote_directory=${PI_APP_DIR:-todo-app}
public_api_bind_address=${PI_LAN_ADDRESS:-}
case "$ssh_target" in "" | -* | *[!A-Za-z0-9._@:%-]*)
  echo 'PI_SSH_TARGET must be a safe SSH destination such as user@todo-pi.local' >&2; exit 2;; esac
case "$remote_directory" in "" | /* | *..* | *[!A-Za-z0-9._/-]*)
  echo "PI_APP_DIR must be a safe path inside the remote user's home directory" >&2; exit 2;; esac
case "$public_api_bind_address" in "" | *[!0-9.]* | .* | *. | *..*)
  echo "PI_LAN_ADDRESS must be the Pi's IPv4 LAN address" >&2; exit 2;; esac
case "${PI_ADOPT_LEGACY_CHECKSUMS:-0}" in 0|1) ;; *) echo 'PI_ADOPT_LEGACY_CHECKSUMS must be 0 or 1' >&2; exit 2;; esac
repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repository_root"
stage=$(mktemp -d "${TMPDIR:-/tmp}/todo-release.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
revision=$(node tools/stage-release.mjs "$stage/release")
release_directory="$remote_directory/releases/$revision"
ssh "$ssh_target" "mkdir -p '$release_directory'"
rsync --archive --compress --delete "$stage/release/" "$ssh_target:$release_directory/"
ssh "$ssh_target" "MIGRATION_ADOPT_LEGACY_CHECKSUMS=${PI_ADOPT_LEGACY_CHECKSUMS:-0} sh '$release_directory/backend/scripts/activate_release.sh' '$remote_directory' '$revision' '$public_api_bind_address'"
echo "Deployed committed release $revision. Local notes and uncommitted files were excluded."
