#!/bin/sh
set -e

if [ "$SERVICE_TYPE" = "worker" ]; then
  echo "Building worker service (prisma generate only)..."
  npx prisma generate
else
  echo "Building web service..."
  npm run build
fi
