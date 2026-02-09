#!/bin/bash -l
cd "$(dirname "$0")"

# Load nvm/fnm if present
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$HOME/.fnm/fnm" ] && eval "$(fnm env)"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║       🤖  Starting Richy         ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── Verify Node.js ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  ❌ Node.js not found. Install it first:"
  echo "     https://nodejs.org"
  read -p "  Press Enter to close..."
  exit 1
fi
echo "  Node $(node -v) | npm $(npm -v)"

# ── Install dependencies if needed ──────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo ""
  echo "  📦 Installing dependencies (first run)..."
  npm install
fi

# ── Kill any stale Richy server processes ───────────────────────────
STALE_PIDS=$(lsof -i :3000 -sST:LISTEN -t 2>/dev/null)
if [ -n "$STALE_PIDS" ]; then
  echo ""
  echo "  🧹 Killing old server on port 3000 (PIDs: $STALE_PIDS)..."
  echo "$STALE_PIDS" | xargs kill -9 2>/dev/null
  sleep 1
fi

# Clean stale lock files
rm -f .next/dev/lock

# ── Ensure Ollama is running (for background AI tasks) ──────────────
if command -v ollama &>/dev/null; then
  if ! curl -s -o /dev/null http://localhost:11434/api/tags 2>/dev/null; then
    echo ""
    echo "  🦙 Starting Ollama..."
    ollama serve &>/dev/null &
    # Wait up to 10s for Ollama to be ready
    OLLAMA_TRIES=0
    until curl -s -o /dev/null http://localhost:11434/api/tags 2>/dev/null; do
      sleep 1
      OLLAMA_TRIES=$((OLLAMA_TRIES + 1))
      if [ $OLLAMA_TRIES -gt 10 ]; then
        echo "  ⚠️  Ollama didn't start — background AI will fall back to API"
        break
      fi
    done
    if [ $OLLAMA_TRIES -le 10 ]; then
      echo "  ✅ Ollama ready"
    fi
  else
    echo "  ✅ Ollama already running"
  fi
else
  echo "  ℹ️  Ollama not installed — background AI will use API provider"
fi

# ── Start Richy ─────────────────────────────────────────────────────
echo ""
echo "  ⏳ Starting server..."
echo ""
npm run dev &
SERVER_PID=$!

# Wait for server to be ready (timeout after 45s)
TRIES=0
until curl -s -o /dev/null http://localhost:3000 2>/dev/null; do
  sleep 1
  TRIES=$((TRIES + 1))
  if [ $TRIES -gt 45 ]; then
    echo ""
    echo "  ❌ Server failed to start. Check the output above for errors."
    read -p "  Press Enter to close..."
    exit 1
  fi
done

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   ✅  Richy is ready!            ║"
echo "  ║   http://localhost:3000          ║"
echo "  ╚══════════════════════════════════╝"
echo ""
open http://localhost:3000

# Keep running until user closes terminal
wait $SERVER_PID
