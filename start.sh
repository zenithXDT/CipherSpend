#!/bin/bash

# CipherSpend Railway Deployment Script
# Starts backend and frontend in one Railway service.

set -euo pipefail

echo "Starting CipherSpend on Railway..."

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo -e "${RED}Error: Python runtime not found.${NC}"
  exit 1
fi

PY_MAJOR="$("$PYTHON_BIN" -c 'import sys; print(sys.version_info.major)')"
if [ "$PY_MAJOR" -lt 3 ]; then
  echo -e "${RED}Error: Python 3 is required, found Python ${PY_MAJOR}.${NC}"
  exit 1
fi

if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
  echo -e "${RED}Error: pip is not available for $PYTHON_BIN.${NC}"
  exit 1
fi

echo -e "${BLUE}Installing backend dependencies...${NC}"
(
  cd backend
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements.txt
)

echo -e "${BLUE}Installing and building frontend...${NC}"
(
  cd frontend
  npm ci
  npm run build
)

BACKEND_PORT=8000
FRONTEND_PORT="${PORT:-3000}"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo "Shutting down..."
  if [ -n "${BACKEND_PID}" ]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID}" ]; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${BACKEND_PID}" ]; then
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID}" ]; then
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup SIGTERM SIGINT

echo -e "${BLUE}Starting backend on ${BACKEND_PORT}...${NC}"
(
  cd backend
  "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port "${BACKEND_PORT}"
) &
BACKEND_PID=$!

echo -e "${BLUE}Waiting for backend readiness...${NC}"
READY=0
for _ in $(seq 1 30); do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo -e "${RED}Error: Backend process exited before becoming ready.${NC}"
    cleanup
    exit 1
  fi

  if "$PYTHON_BIN" -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:${BACKEND_PORT}/docs', timeout=1); sys.exit(0)" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "${READY}" -ne 1 ]; then
  echo -e "${RED}Error: Backend did not become ready in time.${NC}"
  cleanup
  exit 1
fi

echo -e "${BLUE}Starting frontend on ${FRONTEND_PORT}...${NC}"
(
  cd frontend
  npx --yes serve@14 -s dist -l "${FRONTEND_PORT}"
) &
FRONTEND_PID=$!

echo -e "${GREEN}CipherSpend started.${NC}"
echo -e "${GREEN}Frontend: http://0.0.0.0:${FRONTEND_PORT}${NC}"
echo -e "${GREEN}Backend: http://0.0.0.0:${BACKEND_PORT}${NC}"

set +e
wait -n "${BACKEND_PID}" "${FRONTEND_PID}"
EXIT_CODE=$?
set -e
if [ "${EXIT_CODE}" -ne 0 ]; then
  echo -e "${RED}A process exited unexpectedly.${NC}"
  cleanup
  exit "${EXIT_CODE}"
fi
cleanup
