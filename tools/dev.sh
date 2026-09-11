#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"
for tool in node yarn ssh curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing development tool: $tool" >&2; exit 2; }
done

setting() {
  node --input-type=module -e '
    import { existsSync, readFileSync } from "node:fs";
    import { parseEnv } from "node:util";
    const [key, fallback] = process.argv.slice(1);
    const local = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
    process.stdout.write(process.env[key] ?? local[key] ?? fallback);
  ' "$1" "$2"
}
ssh_target=$(setting PI_SSH_TARGET '')
tunnel_port=$(setting PI_DEVELOPMENT_API_PORT 3001)

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

node --input-type=module -e '
  const port = process.argv[1];
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PI_DEVELOPMENT_API_PORT must be an integer between 1 and 65535");
' "$tunnel_port"

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
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
