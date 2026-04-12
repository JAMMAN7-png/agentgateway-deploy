#!/bin/bash
set -e

# Start sigari LLM gateway in background
cd /sigari && bun run index.ts &

# Start agentgateway in foreground (PID 1 behavior)
/app/agentgateway -f /config.yaml
