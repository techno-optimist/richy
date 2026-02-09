import { db, schema } from "../db";
import { nanoid } from "nanoid";
import { eq, and, sql, desc } from "drizzle-orm";
import { getExchange } from "./client";
import { getSettingSync } from "../db/settings";

export interface OpenPositionParams {
  symbol: string;
  side?: "long" | "short";
  entryPrice: number;
  amount: number;
  costBasis: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStopPct?: number;
  entryTradeId?: string;
}

export interface PositionSummary {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  amount: number;
  costBasis: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopPct: number | null;
  highWaterMark: number | null;
  status: string;
  entryTradeId: string | null;
  createdAt: Date | null;
  // Live data (populated by getOpenPositionSummaries)
  currentPrice?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  distanceToSL?: number;
  distanceToTP?: number;
}

export async function openPosition(params: OpenPositionParams): Promise<string> {
  const id = nanoid();

  // Use default SL/TP from settings if not provided
  const defaultSLPct = parseFloat(getSettingSync("crypto_default_stop_loss_pct") || "5");
  const defaultTPPct = parseFloat(getSettingSync("crypto_default_take_profit_pct") || "10");

  const stopLoss =
    params.stopLoss ??
    (defaultSLPct > 0 ? params.entryPrice * (1 - defaultSLPct / 100) : null);
  const takeProfit =
    params.takeProfit ??
    (defaultTPPct > 0 ? params.entryPrice * (1 + defaultTPPct / 100) : null);

  const trailingStopPctSetting = getSettingSync("crypto_trailing_stop_enabled");
  const trailingStopPct =
    params.trailingStopPct ??
    (trailingStopPctSetting === "on"
      ? parseFloat(getSettingSync("crypto_trailing_stop_pct") || "3")
      : null);

  await db.insert(schema.openPositions).values({
    id,
    symbol: params.symbol,
    side: params.side ?? "long",
    entryPrice: params.entryPrice,
    amount: params.amount,
    costBasis: params.costBasis,
    stopLoss,
    takeProfit,
    trailingStopPct,
    highWaterMark: params.entryPrice,
    status: "open",
    entryTradeId: params.entryTradeId ?? null,
  });

  return id;
}

export async function closePosition(params: {
  positionId: string;
  exitTradeId?: string;
  exitPrice: number;
  status?: "closed" | "stopped_out" | "took_profit";
}): Promise<void> {
  const position = db
    .select()
    .from(schema.openPositions)
    .where(eq(schema.openPositions.id, params.positionId))
    .get();

  if (!position) return;

  const realizedPnl =
    position.side === "long"
      ? (params.exitPrice - position.entryPrice) * position.amount
      : (position.entryPrice - params.exitPrice) * position.amount;

  await db
    .update(schema.openPositions)
    .set({
      status: params.status ?? "closed",
      exitTradeId: params.exitTradeId ?? null,
      realizedPnl,
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.openPositions.id, params.positionId));
}

export async function updatePositionLevels(
  positionId: string,
  updates: {
    stopLoss?: number;
    takeProfit?: number;
    trailingStopPct?: number;
    highWaterMark?: number;
  }
): Promise<void> {
  const set: Record<string, any> = { updatedAt: new Date() };
  if (updates.stopLoss !== undefined) set.stopLoss = updates.stopLoss;
  if (updates.takeProfit !== undefined) set.takeProfit = updates.takeProfit;
  if (updates.trailingStopPct !== undefined) set.trailingStopPct = updates.trailingStopPct;
  if (updates.highWaterMark !== undefined) set.highWaterMark = updates.highWaterMark;

  await db
    .update(schema.openPositions)
    .set(set)
    .where(eq(schema.openPositions.id, positionId));
}

export async function getOpenPositionSummaries(): Promise<PositionSummary[]> {
  const positions = db
    .select()
    .from(schema.openPositions)
    .where(eq(schema.openPositions.status, "open"))
    .orderBy(desc(schema.openPositions.createdAt))
    .all();

  if (positions.length === 0) return [];

  // Fetch live prices for all unique symbols
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const prices: Record<string, number> = {};

  try {
    const exchange = getExchange();
    const tickers = await Promise.allSettled(
      symbols.map((s) => exchange.fetchTicker(s))
    );
    for (let i = 0; i < symbols.length; i++) {
      const result = tickers[i];
      if (result.status === "fulfilled" && result.value.last) {
        prices[symbols[i]] = result.value.last;
      }
    }
  } catch (err: any) {
    console.error("[Richy:Positions] Failed to fetch prices:", err.message);
  }

  return positions.map((p) => {
    const currentPrice = prices[p.symbol];
    let unrealizedPnl: number | undefined;
    let unrealizedPnlPct: number | undefined;
    let distanceToSL: number | undefined;
    let distanceToTP: number | undefined;

    if (currentPrice) {
      unrealizedPnl =
        p.side === "long"
          ? (currentPrice - p.entryPrice) * p.amount
          : (p.entryPrice - currentPrice) * p.amount;
      unrealizedPnlPct = (unrealizedPnl / p.costBasis) * 100;

      if (p.stopLoss) {
        distanceToSL = ((currentPrice - p.stopLoss) / currentPrice) * 100;
      }
      if (p.takeProfit) {
        distanceToTP = ((p.takeProfit - currentPrice) / currentPrice) * 100;
      }
    }

    return {
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      entryPrice: p.entryPrice,
      amount: p.amount,
      costBasis: p.costBasis,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      trailingStopPct: p.trailingStopPct,
      highWaterMark: p.highWaterMark,
      status: p.status,
      entryTradeId: p.entryTradeId,
      createdAt: p.createdAt,
      currentPrice,
      unrealizedPnl,
      unrealizedPnlPct,
      distanceToSL,
      distanceToTP,
    };
  });
}

export async function getPositionForSymbol(
  symbol: string
): Promise<PositionSummary | null> {
  const summaries = await getOpenPositionSummaries();
  return summaries.find((s) => s.symbol === symbol) ?? null;
}
