import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New conversation"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  archived: integer("archived", { mode: "boolean" }).default(false),
  metadata: text("metadata"),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["user", "assistant", "system", "tool"],
  }).notNull(),
  content: text("content"),
  parts: text("parts"),
  toolCalls: text("tool_calls"),
  toolResults: text("tool_results"),
  model: text("model"),
  tokenUsage: text("token_usage"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: ["fact", "preference", "pattern", "note", "entity"],
  }).notNull(),
  content: text("content").notNull(),
  source: text("source"),
  embedding: text("embedding"),
  importance: real("importance").default(0.5),
  accessCount: integer("access_count").default(0),
  lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  metadata: text("metadata"),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ["once", "cron"] }).notNull(),
  schedule: text("schedule"),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  status: text("status", {
    enum: ["active", "paused", "completed", "failed"],
  }).default("active"),
  action: text("action").notNull(),
  result: text("result"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const imessageState = sqliteTable("imessage_state", {
  id: text("id").primaryKey().default("singleton"),
  lastSeenRowId: text("last_seen_row_id").default("0"),
  conversationId: text("conversation_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const telegramState = sqliteTable("telegram_state", {
  id: text("id").primaryKey(),
  lastUpdateId: integer("last_update_id").default(0),
  conversationId: text("conversation_id"),
  chatId: text("chat_id"),
  username: text("username"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const evolutionLog = sqliteTable("evolution_log", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: [
      "tool_created",
      "tool_deleted",
      "file_modified",
      "file_created",
      "command_run",
    ],
  }).notNull(),
  description: text("description").notNull(),
  details: text("details"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const sentinelRuns = sqliteTable("sentinel_runs", {
  id: text("id").primaryKey(),
  indicators: text("indicators"), // JSON: technical indicators snapshot
  portfolio: text("portfolio"), // JSON: portfolio at time of run
  sentiment: text("sentiment"), // JSON: parsed sentiment data
  signals: text("signals"), // JSON: signal list
  actions: text("actions"), // JSON: actions taken
  summary: text("summary"),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const tradeHistory = sqliteTable("trade_history", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side", { enum: ["buy", "sell"] }).notNull(),
  orderType: text("order_type", { enum: ["market", "limit"] }).notNull(),
  amount: real("amount").notNull(),
  price: real("price"),
  cost: real("cost"),
  orderId: text("order_id"),
  source: text("source", {
    enum: ["sentinel", "user", "stop_loss", "take_profit"],
  }).default("user"),
  reasoning: text("reasoning"),
  sentinelRunId: text("sentinel_run_id"),
  positionId: text("position_id"),
  sandbox: integer("sandbox", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const openPositions = sqliteTable("open_positions", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side", { enum: ["long", "short"] })
    .notNull()
    .default("long"),
  entryPrice: real("entry_price").notNull(),
  amount: real("amount").notNull(),
  costBasis: real("cost_basis").notNull(),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  trailingStopPct: real("trailing_stop_pct"),
  highWaterMark: real("high_water_mark"),
  status: text("status", {
    enum: ["open", "closed", "stopped_out", "took_profit"],
  })
    .notNull()
    .default("open"),
  entryTradeId: text("entry_trade_id"),
  exitTradeId: text("exit_trade_id"),
  realizedPnl: real("realized_pnl"),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const toolConfigs = sqliteTable("tool_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["builtin", "mcp", "custom"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  config: text("config").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});
