#!/usr/bin/env bash

set -Eeuo pipefail

export NVM_DIR="/home/ubuntu/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

export PATH="$NVM_DIR/versions/node/v22.23.2/bin:$PATH"

PROJECT_DIR="/home/ubuntu/moving-backend"
PROCESS_NAME="moving-backend"
HEALTH_CHECK_URL="http://localhost/api/health"
RELEASE_FILE="/tmp/moving-backend-release.tar.gz"

ARTIFACT_URL="${1:-}"

if [ -z "$ARTIFACT_URL" ]; then
  echo "❌ Deployment artifact URL is required."
  exit 1
fi

cd "$PROJECT_DIR"

echo "⬇️ Downloading deployment package..."

curl \
  --fail \
  --location \
  --silent \
  --show-error \
  "$ARTIFACT_URL" \
  --output "$RELEASE_FILE"

echo "🛑 Stopping application..."

pm2 stop "$PROCESS_NAME" || true

echo "🧹 Removing previous deployment files..."

rm -rf "$PROJECT_DIR/dist"
rm -rf "$PROJECT_DIR/node_modules"

echo "📦 Extracting deployment package..."

tar -xzf "$RELEASE_FILE" -C "$PROJECT_DIR"

rm -f "$RELEASE_FILE"

echo "🚀 Starting application..."

pm2 delete "$PROCESS_NAME" || true

pm2 start "$PROJECT_DIR/node_modules/.bin/tsx" \
  --name "$PROCESS_NAME" \
  --time \
  -- "$PROJECT_DIR/src/server.ts"

pm2 save

echo "🩺 Checking application health..."

for attempt in 1 2 3 4 5 6; do
  if curl --fail --silent --show-error "$HEALTH_CHECK_URL"; then
    echo
    echo "✅ Deployment completed successfully."
    exit 0
  fi

  echo "Health check attempt ${attempt}/6 failed. Retrying in 5 seconds..."
  sleep 5
done

echo "❌ Health check failed."

pm2 status
pm2 logs "$PROCESS_NAME" --lines 50 --nostream || true

exit 1