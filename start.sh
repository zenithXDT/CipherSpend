#!/bin/bash

# CipherSpend Railway Deployment Script
# Starts backend and frontend in one Railway service.

set -euo pipefail

echo "Starting CipherSpend on Railway..."

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "Error: Python runtime not found. Ensure Railway includes Python in this service."
  exit 1
fi

if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
  echo "Error: pip is not available for $PYTHON_BIN."
  exit 1
fi

echo -e "${BLUE}Installing backend dependencies...${NC}"
(
  cd backend
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements.txt
)

echo -e "${BLUE}Installing frontend dependencies...${NC}"
(
  cd frontend
  npm ci
)

BACKEND_PORT=8000
FRONTEND_PORT="${PORT:-3000}"

echo -e "${BLUE}Starting backend on ${BACKEND_PORT}...${NC}"
(
  cd backend
  "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port "${BACKEND_PORT}"
) &
BACKEND_PID=$!

sleep 3

echo -e "${BLUE}Building and starting frontend on ${FRONTEND_PORT}...${NC}"
(
  cd frontend
  npm run build
  npm run preview -- --host 0.0.0.0 --port "${FRONTEND_PORT}"
) &
FRONTEND_PID=$!

echo -e "${GREEN}CipherSpend started.${NC}"
echo -e "${GREEN}Frontend: http://0.0.0.0:${FRONTEND_PORT}${NC}"
echo -e "${GREEN}Backend: http://0.0.0.0:${BACKEND_PORT}${NC}"

trap 'echo "Shutting down..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' SIGTERM SIGINT
wait
