import { db, schema } from "../db";
import { nanoid } from "nanoid";
import { desc, eq, sql } from "drizzle-orm";

export interface TradeLogEntry {
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  amount: number;
  price?: number;
  cost?: number;
  orderId?: string;
  source?: "sentinel" | "user" | "stop_loss" | "take_profit";
  reasoning?: string;
  sentinelRunId?: string;
  positionId?: string;
  sandbox?: boolean;
}

export interface TradeLogRow {
  id: string;
  symbol: string;
  side: string;
  orderType: string;
  amount: number;
  price: number | null;
  cost: number | null;
  orderId: string | null;
  source: string | null;
  reasoning: string | null;
  sentinelRunId: string | null;
  positionId: string | null;
  sandbox: boolean | null;
  createdAt: Date | null;
}

export async function logTrade(entry: TradeLogEntry): Promise<string> {
  const id = nanoid();
  await db.insert(schema.tradeHistory).values({
    id,
    symbol: entry.symbol,
    side: entry.side,
    orderType: entry.orderType,
    amount: entry.amount,
    price: entry.price ?? null,
    cost: entry.cost ?? null,
    orderId: entry.orderId ?? null,
    source: entry.source ?? "user",
    reasoning: entry.reasoning ?? null,
    sentinelRunId: entry.sentinelRunId ?? null,
    positionId: entry.positionId ?? null,
    sandbox: entry.sandbox ?? false,
  });
  return id;
}

export async function getRecentTrades(limit: number = 20): Promise<TradeLogRow[]> {
  return db
    .select()
    .from(schema.tradeHistory)
    .orderBy(desc(schema.tradeHistory.createdAt))
    .limit(limit)
    .all() as TradeLogRow[];
}

export async function getTradesForSymbol(
  symbol: string,
  limit: number = 20
): Promise<TradeLogRow[]> {
  return db
    .select()
    .from(schema.tradeHistory)
    .where(eq(schema.tradeHistory.symbol, symbol))
    .orderBy(desc(schema.tradeHistory.createdAt))
    .limit(limit)
    .all() as TradeLogRow[];
}

export async function getDailyTradeStats(): Promise<{
  tradesCount: number;
  realizedPnl: number;
  volume: number;
  winners: number;
  losers: number;
}> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEpoch = Math.floor(todayStart.getTime() / 1000);

  const rows = db
    .select()
    .from(schema.tradeHistory)
    .where(sql`${schema.tradeHistory.createdAt} >= ${todayEpoch}`)
    .all();

  let volume = 0;
  for (const r of rows) {
    volume += r.cost ?? 0;
  }

  // Get realized P&L from positions closed today
  const closedToday = db
    .select()
    .from(schema.openPositions)
    .where(sql`${schema.openPositions.closedAt} >= ${todayEpoch} AND ${schema.openPositions.status} != 'open'`)
    .all();

  let realizedPnl = 0;
  let winners = 0;
  let losers = 0;
  for (const p of closedToday) {
    const pnl = p.realizedPnl ?? 0;
    realizedPnl += pnl;
    if (pnl > 0) winners++;
    else if (pnl < 0) losers++;
  }

  return {
    tradesCount: rows.length,
    realizedPnl,
    volume,
    winners,
    losers,
  };
}
