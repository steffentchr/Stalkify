#!/bin/sh
set -e

npx prisma db push

if [ "$SERVICE_TYPE" = "worker" ]; then
  echo "Starting worker service..."
  npm run worker
else
  echo "Starting web service..."
  npm run start
fi
