#!/bin/sh
set -e

# Start sigari LLM gateway in background
cd /sigari && bun run index.ts &
SIGARI_PID=$!

# Start agentgateway in foreground
exec /app/agentgateway -f /config.yaml &
AGW_PID=$!

# Wait for either process to exit
wait -n $SIGARI_PID $AGW_PID 2>/dev/null || true

# If one dies, kill the other and exit
kill $SIGARI_PID $AGW_PID 2>/dev/null
wait
