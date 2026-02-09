# Richy

**Real-time Intelligent Crypto Handler for You**

A personal autonomous AI agent that runs locally on your machine. Richy monitors crypto markets, executes trades, manages a memory system, handles messages, and runs background tasks — all without cloud dependencies beyond the AI APIs you choose.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)
![AI SDK](https://img.shields.io/badge/AI_SDK-v6-purple)
![License](https://img.shields.io/badge/License-MIT-green)

---

## What It Does

Richy is a fully autonomous AI agent with a local-first architecture. Everything runs on your machine — your data stays yours.

### Autonomous Trading Engine

- **Sentinel** — AI-powered market analysis every 30 minutes. Fetches live prices, computes technical indicators (RSI, MACD, SMA, EMA, Bollinger Bands), scrapes news/Reddit sentiment, and makes buy/sell decisions.
- **Guardian** — Lightweight stop-loss and take-profit enforcement loop (every 120s, no AI). Supports trailing stops with high-water mark tracking.
- **CEO Mode** — Daily strategic briefing from Claude (the expensive, smart model) that issues a structured directive. The Sentinel (running on a local Ollama model) follows this directive for tactical decisions. Like a real CEO: don't waste their time, employees do the heavy lifting. ~$0.01/day.
- **Risk Controls** — Configurable max trade size, daily loss limits, trade count limits, sandbox/paper trading mode.

### AI Chat Interface

- Streaming chat with tool use (calculator, web search, web browse, code execution, memory, trading, messaging)
- Dual-model architecture: Claude for primary intelligence, local Ollama for background tasks
- Conversation history with full context

### Memory System

- Local embeddings via HuggingFace Transformers (runs on-device)
- Cosine similarity search for contextual memory recall
- Automatic memory extraction from conversations

### Messaging Integration

- **Telegram** — Bot API polling for bidirectional messaging
- **iMessage** — Direct read from `chat.db` + AppleScript for sending (macOS only)
- Autonomous notifications for trade executions, alerts, and daily reports

### Task Scheduler

- Background task system with cron-like scheduling
- Runs due tasks through the AI agent automatically

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Next.js 16 App                    │
│                   (Single Process)                   │
├──────────────┬──────────────┬───────────────────────┤
│   Frontend   │   tRPC API   │   Background Systems  │
│  React 19    │   Routers    │                       │
│  shadcn/ui   │              │  Sentinel (30min)     │
│  Tailwind v4 │              │  Guardian (120s)      │
│  Recharts    │              │  CEO Scheduler (24h)  │
│              │              │  Task Scheduler (60s) │
│              │              │  Telegram Polling      │
│              │              │  iMessage Polling      │
├──────────────┴──────────────┴───────────────────────┤
│              SQLite + Drizzle ORM (WAL mode)         │
│              Local Embeddings (HuggingFace)          │
│              CCXT (Exchange APIs)                     │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Single process — no microservices, no Docker, no Redis. One `next dev` and everything runs.
- SQLite with WAL mode — fast, zero-config, file-based. Auto-migrates on startup.
- All secrets stored in the database settings table — no `.env` files to manage.
- Background systems start via `instrumentation.ts` with a 3-second warmup delay.

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** (comes with Node)
- An AI provider API key (Anthropic recommended, OpenAI also supported)
- Optional: [Ollama](https://ollama.ai) for free local background model
- Optional: Coinbase API keys for live trading
- Optional: Telegram Bot Token for messaging
- macOS for iMessage integration (reads `~/Library/Messages/chat.db`)

### Install & Run

```bash
git clone https://github.com/techno-optimist/richy.git
cd richy
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first launch, you'll hit the onboarding flow to configure your AI provider and basic settings.

**macOS Quick Start:** Double-click `start-buddy.command` to auto-install dependencies and launch.

### Configuration

All configuration happens through the web UI at **Settings**:

| Setting | Where | Notes |
|---------|-------|-------|
| AI Provider & API Key | Settings > AI | Anthropic (Claude) or OpenAI |
| Background Model | Settings > AI | Ollama for free local inference |
| Exchange API Keys | Settings > Trading | Coinbase supported via CCXT |
| Telegram Bot Token | Settings > Messaging | Create via [@BotFather](https://t.me/BotFather) |
| Trading Parameters | Sentinel Page > Agent Management | Limits, risk controls, coins |
| CEO Mode | Sentinel Page > Agent Management | Daily Claude strategic briefings |

---

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (app)/                  # Main app routes
│   │   ├── chat/               # Chat interface
│   │   ├── sentinel/           # Trading dashboard
│   │   ├── memory/             # Memory management
│   │   ├── settings/           # Configuration
│   │   └── tasks/              # Task management
│   └── api/                    # API routes (chat streaming, tRPC)
├── components/                 # React components (shadcn/ui)
├── server/
│   ├── agent/                  # AI agent (runner, providers, system prompt)
│   ├── crypto/                 # Trading engine
│   │   ├── sentinel.ts         # AI market analysis (every 30min)
│   │   ├── guardian.ts         # SL/TP enforcement (every 120s)
│   │   ├── ceo.ts              # Claude strategic briefings (daily)
│   │   ├── analysis.ts         # Technical indicators (RSI, MACD, etc.)
│   │   ├── positions.ts        # Position tracking with SL/TP
│   │   ├── trade-logger.ts     # Trade persistence
│   │   ├── sources.ts          # News/Reddit/web scraping
│   │   └── client.ts           # CCXT exchange client
│   ├── db/                     # SQLite + Drizzle ORM
│   ├── memory/                 # Embeddings & search
│   ├── telegram/               # Telegram bot integration
│   ├── imessage/               # iMessage read/send (macOS)
│   ├── tasks/                  # Background task scheduler
│   ├── tools/                  # AI tool definitions
│   │   └── builtin/            # 12 built-in tools
│   └── trpc/                   # tRPC routers
└── instrumentation.ts          # Startup: migrations + background systems
```

---

## The CEO/Sentinel Dynamic

Richy's trading system has a unique two-tier AI architecture:

```
Claude (CEO) ──── once/day ────→ Strategic Directive (stored in DB)
                                        │
                                        ↓ read every tick
Ollama (Sentinel) ── every 30min ──→ Tactical analysis + trades
    │                                   (follows CEO directive)
    └── escalation ──→ Off-schedule CEO call (max 1 per 4h)
         (market moves >10% against directive, or directive expired)
```

**Why?** Claude is smart but expensive. Ollama is free but needs direction. The CEO issues a daily strategic directive (market regime, coin biases, key levels, risk rules) that the Sentinel follows for every tactical decision. If markets move dramatically against the directive, the Sentinel can escalate to the CEO for an updated assessment.

**Cost:** ~$0.01/day for the daily CEO briefing (~2000 tokens). Rare escalations add minimal overhead.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, shadcn/ui, Framer Motion |
| Database | SQLite (better-sqlite3), Drizzle ORM |
| AI | AI SDK v6, Anthropic Claude, OpenAI, Ollama |
| API | tRPC v11, React Query |
| Crypto | CCXT (multi-exchange), custom TA engine |
| Embeddings | @huggingface/transformers (local) |
| Messaging | grammY (Telegram), AppleScript (iMessage) |
| Charts | Recharts |
| State | Zustand |

---

## Development

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # Type check
```

The database auto-migrates on startup — no manual migration commands needed.

---

## License

MIT
