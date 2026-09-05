#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ssh_target=${PI_SSH_TARGET:-}
if [ -z "$ssh_target" ] && [ -r "$repository_root/.env.local" ]; then
  ssh_target=$(sed -n 's/^PI_SSH_TARGET=//p' "$repository_root/.env.local" | tail -n 1)
fi
tunnel_port=${PI_DEVELOPMENT_API_PORT:-3001}

case "$ssh_target" in
  "")
    echo "Set PI_SSH_TARGET in .env.local before running yarn dev" >&2
    exit 2
    ;;
  -* | *[!A-Za-z0-9._@:%-]*)
    echo "PI_SSH_TARGET must be a safe SSH destination such as user@todo-pi.local" >&2
    exit 2
    ;;
esac

case "$tunnel_port" in
  "" | *[!0-9]* | 0)
    echo "PI_DEVELOPMENT_API_PORT must be a positive port number" >&2
    exit 2
    ;;
esac

ssh \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -N \
  -L "127.0.0.1:$tunnel_port:127.0.0.1:3001" \
  "$ssh_target" &
tunnel_pid=$!

cleanup() {
  kill "$tunnel_pid" 2>/dev/null || true
  wait "$tunnel_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:$tunnel_port/healthz" >/dev/null 2>&1; do
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    echo "The SSH tunnel could not be opened" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 40 ]; then
    echo "The private development API did not become ready" >&2
    exit 1
  fi
  sleep 0.25
done

echo "Private Pi API tunnel ready on http://127.0.0.1:$tunnel_port"
API_PROXY_TARGET="http://127.0.0.1:$tunnel_port" yarn vite --host 127.0.0.1 --port 4173
