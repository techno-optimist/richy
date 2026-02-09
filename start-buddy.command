#!/bin/bash -l
cd "$(dirname "$0")"

# Load nvm/fnm if present
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$HOME/.fnm/fnm" ] && eval "$(fnm env)"

echo "🤖 Starting Buddy..."
echo ""

# Verify node is available
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Please install Node.js first."
  echo "   https://nodejs.org"
  read -p "Press Enter to close..."
  exit 1
fi

echo "   Node $(node -v) | npm $(npm -v)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first run)..."
  npm install
  echo ""
fi

# Clean stale lock files
rm -f .next/dev/lock

# Check if port 3000 is already in use
if lsof -i :3000 -sST:LISTEN -t >/dev/null 2>&1; then
  echo "✅ Buddy is already running!"
  open http://localhost:3000
  read -p "Press Enter to close..."
  exit 0
fi

# Start dev server
echo "⏳ Starting server..."
npm run dev &
SERVER_PID=$!

# Wait for server to be ready (timeout after 30s)
TRIES=0
until curl -s -o /dev/null http://localhost:3000 2>/dev/null; do
  sleep 1
  TRIES=$((TRIES + 1))
  if [ $TRIES -gt 30 ]; then
    echo "❌ Server failed to start. Check the output above for errors."
    read -p "Press Enter to close..."
    exit 1
  fi
done

echo ""
echo "✅ Buddy is ready at http://localhost:3000"
open http://localhost:3000

# Keep running until user closes terminal
wait $SERVER_PID
