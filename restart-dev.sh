#!/usr/bin/env bash
set -euo pipefail

# Use whatever 'go' is on PATH (apt's wrapper will fetch/run 1.25.1 via GOTOOLCHAIN=auto)
echo "==> go binary: $(command -v go)"
go version
echo "GOTOOLCHAIN=$(go env GOTOOLCHAIN)"

# RAM-friendly knobs
export GOMAXPROCS=1
export GOGC=50
PARALLEL="-p=1"

PORT="8082"
APP_DIR="${HOME}/Light-Speed-Duel"
BIN="${HOME}/lsd-dev"
LOG="${HOME}/lsd-dev.log"
ADDR="127.0.0.1:${PORT}"
BUILD_LOG="${HOME}/build-dev.log"

echo "==> Building dev binary..."
mkdir -p "$(dirname "$BIN")"
pushd "$APP_DIR" >/dev/null

# Only do this once if needed; it’s cheap when cached
go mod download

if ! go build ${PARALLEL} -v -trimpath -ldflags="-s -w" -o "${BIN}.tmp" 2>&1 | tee "${BUILD_LOG}"; then
  echo "❌ Build failed. See ${BUILD_LOG}"
  exit 1
fi
mv -f "${BIN}.tmp" "${BIN}"
chmod +x "${BIN}"
popd >/dev/null
echo "✅ Build complete: ${BIN}"

echo "==> Starting dev server on ${ADDR}..."
echo "Logs -> ${LOG}"
truncate -s 0 "$LOG" || true

cd "$APP_DIR"
exec "$BIN" -addr "$ADDR" 2>&1 | tee -a "$LOG"
