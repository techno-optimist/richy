import { db } from "./index";
import { sql } from "drizzle-orm";

export function ensureDatabase() {
  // Create all tables if they don't exist
  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New conversation',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      archived INTEGER DEFAULT 0,
      metadata TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      parts TEXT,
      tool_calls TEXT,
      tool_results TEXT,
      model TEXT,
      token_usage TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT,
      embedding TEXT,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      metadata TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      schedule TEXT,
      next_run_at INTEGER,
      last_run_at INTEGER,
      status TEXT DEFAULT 'active',
      action TEXT NOT NULL,
      result TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS tool_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      config TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS imessage_state (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      last_seen_row_id TEXT DEFAULT '0',
      conversation_id TEXT,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS telegram_state (
      id TEXT PRIMARY KEY,
      last_update_id INTEGER DEFAULT 0,
      conversation_id TEXT,
      chat_id TEXT,
      username TEXT,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS evolution_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS sentinel_runs (
      id TEXT PRIMARY KEY,
      indicators TEXT,
      portfolio TEXT,
      sentiment TEXT,
      signals TEXT,
      actions TEXT,
      summary TEXT,
      tokens_used INTEGER,
      duration_ms INTEGER,
      error TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS trade_history (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      order_type TEXT NOT NULL,
      amount REAL NOT NULL,
      price REAL,
      cost REAL,
      order_id TEXT,
      source TEXT DEFAULT 'user',
      reasoning TEXT,
      sentinel_run_id TEXT,
      position_id TEXT,
      sandbox INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS open_positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL DEFAULT 'long',
      entry_price REAL NOT NULL,
      amount REAL NOT NULL,
      cost_basis REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      trailing_stop_pct REAL,
      high_water_mark REAL,
      status TEXT NOT NULL DEFAULT 'open',
      entry_trade_id TEXT,
      exit_trade_id TEXT,
      realized_pnl REAL,
      closed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Create indexes
  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_updated
    ON conversations(updated_at DESC)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_memories_type
    ON memories(type)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON tasks(status)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_telegram_state_chat_id
    ON telegram_state(chat_id)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_sentinel_runs_created
    ON sentinel_runs(created_at DESC)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_trade_history_created
    ON trade_history(created_at DESC)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_trade_history_symbol
    ON trade_history(symbol, created_at DESC)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_open_positions_status
    ON open_positions(status)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_open_positions_symbol
    ON open_positions(symbol, status)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_trade_history_source
    ON trade_history(source)
  `);
}
