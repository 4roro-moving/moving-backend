#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="/home/ubuntu/moving-backend"
PROCESS_NAME="moving-backend"
HEALTH_CHECK_URL="http://localhost/api/health"

cd "$PROJECT_DIR"

echo "📦 Installing dependencies..."
npm ci

echo "🛠 Generating Prisma Client..."
npx prisma generate

echo "🏗 Building application..."
npm run build

echo "🗄 Applying database migrations..."
npx prisma migrate deploy

echo "🚀 Restarting PM2 process..."
pm2 restart "$PROCESS_NAME" --update-env
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

echo "===== PM2 status ====="
pm2 status

echo "===== Recent application logs ====="
pm2 logs "$PROCESS_NAME" --lines 50 --nostream || true

exit 1