#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Pasang Node.js 20+ daripada https://nodejs.org/ dahulu."
  exit 1
fi
printf 'Game: http://localhost:3000\n'
node server.js
