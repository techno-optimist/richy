import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { getExchange } from "./client";
import { getSettingSync } from "../db/settings";
import { logTrade } from "./trade-logger";
import { closePosition, updatePositionLevels } from "./positions";

let guardianTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

async function guardianTick(): Promise<void> {
  // Get all open positions with SL or TP set
  const positions = db
    .select()
    .from(schema.openPositions)
    .where(eq(schema.openPositions.status, "open"))
    .all();

  if (positions.length === 0) return;

  // Fetch current prices for all symbols
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const prices: Record<string, number> = {};

  let exchange;
  try {
    exchange = getExchange();
  } catch (err: any) {
    consecutiveFailures++;
    console.error(`[Richy:Guardian] Cannot get exchange (failure #${consecutiveFailures}): ${err.message}`);
    if (consecutiveFailures >= 3) {
      console.error("[Richy:Guardian] CRITICAL: 3+ consecutive failures. SL/TP protection may be offline!");
    }
    return;
  }

  const tickers = await Promise.allSettled(
    symbols.map((s) => exchange.fetchTicker(s))
  );
  let fetchedCount = 0;
  for (let i = 0; i < symbols.length; i++) {
    const result = tickers[i];
    if (result.status === "fulfilled" && result.value.last) {
      prices[symbols[i]] = result.value.last;
      fetchedCount++;
    } else {
      const reason = result.status === "rejected" ? result.reason?.message : "no price data";
      console.warn(`[Richy:Guardian] Failed to fetch price for ${symbols[i]}: ${reason}`);
    }
  }

  if (fetchedCount === 0) {
    consecutiveFailures++;
    console.error(`[Richy:Guardian] No prices fetched (failure #${consecutiveFailures})`);
    if (consecutiveFailures >= 3) {
      console.error("[Richy:Guardian] CRITICAL: 3+ consecutive failures. SL/TP protection may be offline!");
    }
    return;
  }

  // Reset failure counter on any successful price fetch
  consecutiveFailures = 0;

  for (const position of positions) {
    const currentPrice = prices[position.symbol];
    if (!currentPrice) continue;

    // Update trailing stop high-water mark
    if (position.trailingStopPct && position.side === "long") {
      const currentHWM = position.highWaterMark ?? position.entryPrice;
      if (currentPrice > currentHWM) {
        await updatePositionLevels(position.id, {
          highWaterMark: currentPrice,
        });
        position.highWaterMark = currentPrice;
      }
    }

    // Calculate effective stop-loss (including trailing)
    let effectiveSL = position.stopLoss;
    if (position.trailingStopPct) {
      const hwm = position.highWaterMark ?? position.entryPrice;
      const trailingSL = hwm * (1 - position.trailingStopPct / 100);
      if (!effectiveSL || trailingSL > effectiveSL) {
        effectiveSL = trailingSL;
      }
    }

    // Check stop-loss
    if (effectiveSL && position.side === "long" && currentPrice <= effectiveSL) {
      console.log(
        `[Richy:Guardian] STOP-LOSS triggered for ${position.symbol}: price $${currentPrice} <= SL $${effectiveSL.toFixed(2)}`
      );
      await executeProtectiveExit(position, currentPrice, "stop_loss", "stopped_out");
      continue;
    }

    // Check take-profit
    if (position.takeProfit && position.side === "long" && currentPrice >= position.takeProfit) {
      console.log(
        `[Richy:Guardian] TAKE-PROFIT triggered for ${position.symbol}: price $${currentPrice} >= TP $${position.takeProfit.toFixed(2)}`
      );
      await executeProtectiveExit(position, currentPrice, "take_profit", "took_profit");
      continue;
    }
  }
}

async function executeProtectiveExit(
  position: typeof schema.openPositions.$inferSelect,
  currentPrice: number,
  source: "stop_loss" | "take_profit",
  status: "stopped_out" | "took_profit"
): Promise<void> {
  const isSandbox = getSettingSync("crypto_sandbox_mode") !== "off";

  try {
    // Place market sell order
    const exchange = getExchange();
    const order = await exchange.createOrder(
      position.symbol,
      "market",
      "sell",
      position.amount
    );

    // Verify the order actually filled
    const filledAmount = order.filled ?? order.amount ?? position.amount;
    if (order.status === "canceled" || order.status === "expired") {
      throw new Error(`${source} exit order was ${order.status} — position still open!`);
    }
    if (filledAmount < position.amount * 0.95) {
      console.warn(
        `[Richy:Guardian] Partial fill on ${source} for ${position.symbol}: ${filledAmount}/${position.amount}. Will retry remaining next tick.`
      );
    }

    const fillPrice = order.average || order.price || currentPrice;
    const fillCost = order.cost || fillPrice * filledAmount;

    // Log the trade
    const tradeId = await logTrade({
      symbol: position.symbol,
      side: "sell",
      orderType: "market",
      amount: position.amount,
      price: fillPrice,
      cost: fillCost,
      orderId: order.id,
      source,
      reasoning: `${source === "stop_loss" ? "Stop-loss" : "Take-profit"} triggered at $${currentPrice.toFixed(2)}`,
      positionId: position.id,
      sandbox: isSandbox,
    });

    // Close the position
    await closePosition({
      positionId: position.id,
      exitTradeId: tradeId,
      exitPrice: fillPrice,
      status,
    });

    // Notify user
    const pnl = (fillPrice - position.entryPrice) * position.amount;
    const pnlStr = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
    const label = source === "stop_loss" ? "STOP-LOSS" : "TAKE-PROFIT";
    await notifyGuardianAction(
      `${label} ${position.symbol}: Sold ${position.amount} @ $${fillPrice.toFixed(2)} | P&L: ${pnlStr} | ${isSandbox ? "SANDBOX" : "LIVE"}`
    );
  } catch (err: any) {
    console.error(
      `[Richy:Guardian] Failed to execute ${source} for ${position.symbol}:`,
      err.message
    );
    await notifyGuardianAction(
      `FAILED ${source.toUpperCase()} for ${position.symbol}: ${err.message}`
    );
  }
}

async function notifyGuardianAction(message: string): Promise<void> {
  const notifyText = `[Guardian] ${message}`;

  // Telegram notification
  if (getSettingSync("notify_telegram") === "on") {
    const telegramToken = getSettingSync("telegram_bot_token");
    if (telegramToken) {
      try {
        const { sendTelegramMessage } = await import("../telegram/bot");
        const chats = db
          .select()
          .from(schema.telegramState)
          .all()
          .filter((row) => row.chatId);

        if (chats.length > 0) {
          await sendTelegramMessage(chats[0].chatId!, notifyText);
        }
      } catch (err: any) {
        console.error("[Richy:Guardian] Failed to send Telegram:", err.message);
      }
    }
  }

  // iMessage notification
  if (getSettingSync("notify_imessage") === "on") {
    const rawPhone = getSettingSync("user_phone");
    if (rawPhone) {
      try {
        const { sendIMessage } = await import("../imessage/applescript");
        await sendIMessage(String(rawPhone), notifyText);
      } catch (err: any) {
        console.error("[Richy:Guardian] Failed to send iMessage:", err.message);
      }
    }
  }
}

export async function startGuardian(): Promise<void> {
  const cryptoKey = getSettingSync("crypto_api_key");
  if (!cryptoKey) {
    console.log("[Richy:Guardian] No crypto API key configured. Not starting.");
    return;
  }

  const intervalSec = parseInt(
    getSettingSync("crypto_guardian_interval") || "120",
    10
  ) || 120;
  const intervalMs = intervalSec * 1000;

  guardianTimer = setInterval(() => {
    guardianTick().catch((err) => {
      console.error("[Richy:Guardian] Tick failed:", err.message);
    });
  }, intervalMs);

  console.log(`[Richy:Guardian] Started (every ${intervalSec}s)`);
}

export function stopGuardian(): void {
  if (guardianTimer) {
    clearInterval(guardianTimer);
    guardianTimer = null;
    console.log("[Richy:Guardian] Stopped");
  }
}
