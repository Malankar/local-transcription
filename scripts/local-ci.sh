#!/usr/bin/env bash
# Local CI build simulator — mirrors .github/workflows/release.yml
# Usage:
#   ./scripts/local-ci.sh linux        # native build (no Docker)
#   ./scripts/local-ci.sh win          # Docker + Wine cross-compile
#   ./scripts/local-ci.sh all          # linux + win (mac skipped — needs macOS SDK)
#   ./scripts/local-ci.sh act          # GHA simulation via act — Linux job only (mac/win runners unsupported)
#
# Prerequisites:
#   Linux native:  nothing extra
#   Windows/all:   Docker running  (sudo systemctl start docker)
#   act target:    act installed   (https://github.com/nektos/act)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-linux}"

log()  { echo "▶ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }

check_docker() {
  # Colima (Linux) stores socket at ~/.config/colima/default/docker.sock
  if [[ -S "${HOME}/.config/colima/default/docker.sock" ]]; then
    export DOCKER_HOST="unix://${HOME}/.config/colima/default/docker.sock"
  fi
  docker info &>/dev/null || fail "Docker not running. Start with: colima start"
}

build_linux_native() {
  log "Building Linux (native)..."
  cd "$ROOT"
  pnpm install --frozen-lockfile
  pnpm run dist:linux
  log "Linux artifacts → release/"
}

build_win_docker() {
  check_docker
  log "Building Windows via Docker + Wine..."
  # electronuserland/builder:wine has: Wine, Node, pnpm, electron-builder, cross-compile toolchain
  docker run --rm \
    --privileged \
    -v "$ROOT:/project" \
    -v "eb-cache:/root/.cache/electron-builder" \
    -v "electron-cache:/root/.cache/electron" \
    -w /project \
    -e CI=true \
    -e ELECTRON_CACHE="/root/.cache/electron" \
    -e ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
    electronuserland/builder:wine \
    bash -c "
      sysctl -w vm.mmap_min_addr=0 2>/dev/null || true &&
      apt-get install -y -qq xvfb > /dev/null 2>&1 &&
      Xvfb :99 -screen 0 1024x768x24 &
      sleep 2 &&
      export DISPLAY=:99 &&
      WINEDLLOVERRIDES='mscoree,mshtml=' wineboot --init 2>/dev/null || true &&
      sleep 1 &&
      npm install -g pnpm@10 &&
      pnpm config set confirmModulesPurge false &&
      pnpm install --frozen-lockfile --ignore-scripts &&
      pnpm run build &&
      pnpm exec electron-builder --win --publish never \
        --config.win.signAndEditExecutable=false \
        --config.win.verifyUpdateCodeSignature=false \
        --config.win.target=dir
    "
  log "Windows artifacts → release/"
}

run_act() {
  command -v act &>/dev/null || fail "act not installed. Install: https://github.com/nektos/act#installation"
  check_docker
  # act can only simulate Linux runners locally — macOS/Windows runners have no Docker image.
  # This runs only the 'linux' matrix job from the workflow.
  log "Running linux CI job via act..."
  cd "$ROOT"
  local event_file
  event_file="$(mktemp /tmp/act-event-XXXXXX.json)"
  echo '{"ref":"refs/tags/v0.0.0-local"}' > "$event_file"
  act push \
    --workflows .github/workflows/release.yml \
    --platform ubuntu-latest=catthehacker/ubuntu:act-latest \
    --matrix name:linux \
    --eventpath "$event_file" \
    --secret GH_TOKEN="${GH_TOKEN:-dummy}" \
    --artifact-server-path /tmp/act-artifacts
  rm -f "$event_file"
}

case "$TARGET" in
  linux)  build_linux_native ;;
  win)    build_win_docker ;;
  all)    build_linux_native; build_win_docker ;;
  act)    run_act ;;
  *)      fail "Unknown target: $TARGET. Use: linux | win | all | act" ;;
esac
