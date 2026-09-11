#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/home/ubuntu/apps/m_gpssensor"
REPO_DIR="$APP_ROOT/repo"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
LOCK_FILE="$APP_ROOT/deploy.lock"
PUBLIC_ROOT="/var/www/gpssensor"
PUBLIC_RELEASES_DIR="$PUBLIC_ROOT/releases"

mkdir -p "$RELEASES_DIR" "$SHARED_DIR" "$PUBLIC_RELEASES_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

git -C "$REPO_DIR" fetch --quiet origin main
REVISION="$(git -C "$REPO_DIR" rev-parse origin/main)"
CURRENT_REVISION="$(readlink -f "$PUBLIC_ROOT/current" 2>/dev/null | xargs -r basename)"

if [[ "$REVISION" == "$CURRENT_REVISION" ]]; then
  exit 0
fi

RELEASE_DIR="$RELEASES_DIR/$REVISION"
rm -rf "$RELEASE_DIR"
git -C "$REPO_DIR" worktree add --detach "$RELEASE_DIR" "$REVISION"

cleanup() {
  git -C "$REPO_DIR" worktree remove --force "$RELEASE_DIR" >/dev/null 2>&1 || true
  rm -rf "$RELEASE_DIR"
}
trap cleanup ERR

if [[ -f "$SHARED_DIR/app-debug.apk" ]]; then
  mkdir -p "$RELEASE_DIR/web/public/downloads"
  cp "$SHARED_DIR/app-debug.apk" "$RELEASE_DIR/web/public/downloads/app-debug.apk"
fi

(
  cd "$RELEASE_DIR/web"
  npm ci --no-audit --no-fund
  npm run build
)

PUBLIC_RELEASE_DIR="$PUBLIC_RELEASES_DIR/$REVISION"
rm -rf "$PUBLIC_RELEASE_DIR"
mkdir -p "$PUBLIC_RELEASE_DIR"
cp -a "$RELEASE_DIR/web/dist/." "$PUBLIC_RELEASE_DIR/"
ln -sfn "$PUBLIC_RELEASE_DIR" "$PUBLIC_ROOT/current.new"
mv -Tf "$PUBLIC_ROOT/current.new" "$PUBLIC_ROOT/current"
trap - ERR

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name "$REVISION" -printf '%T@ %p\n' \
  | sort -nr | tail -n +4 | cut -d' ' -f2- \
  | while IFS= read -r old_release; do
      git -C "$REPO_DIR" worktree remove --force "$old_release" >/dev/null 2>&1 || true
    done

find "$PUBLIC_RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name "$REVISION" -printf '%T@ %p\n' \
  | sort -nr | tail -n +4 | cut -d' ' -f2- \
  | while IFS= read -r old_release; do rm -rf "$old_release"; done

echo "Deployed $REVISION"
