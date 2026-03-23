#!/bin/bash

# CipherSpend Railway Deployment Script
# This script starts both the backend (FastAPI) and frontend (React/Vite) services

set -e

echo "🚀 Starting CipherSpend on Railway..."

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Install backend dependencies
echo -e "${BLUE}📦 Installing backend dependencies...${NC}"
cd backend
pip install --no-cache-dir -r requirements.txt
cd ..

# Install frontend dependencies
echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
cd frontend
npm install --ci
cd ..

# Start backend in the background
echo -e "${BLUE}🔧 Starting backend (FastAPI on port 8000)...${NC}"
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Give backend time to start
sleep 3

# Start frontend build and serve
echo -e "${BLUE}🎨 Building and starting frontend...${NC}"
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!
cd ..

echo -e "${GREEN}✅ CipherSpend is running!${NC}"
echo -e "${GREEN}Frontend: http://0.0.0.0:5173${NC}"
echo -e "${GREEN}Backend API: http://0.0.0.0:8000${NC}"

# Handle graceful shutdown
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" SIGTERM SIGINT

# Wait for both processes
wait
