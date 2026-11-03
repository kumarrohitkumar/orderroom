#!/usr/bin/env bash
# Wipes local state so the next `npm run setup` behaves like a fresh clone (keeps node_modules).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf data agent/.switch-ctx agent/.mcp.json dist
echo "clean: removed data/, agent/.switch-ctx/, agent/.mcp.json, dist/"
