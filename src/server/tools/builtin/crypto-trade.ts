import { z } from "zod/v4";
import type { RichyToolDef } from "../types";
import {
  getExchange,
  isTradingEnabled,
  getMaxTradeUsd,
} from "../../crypto/client";
import { getSettingSync } from "../../db/settings";
import { getDailyState, saveDailyState } from "../../crypto/daily-state";
import { logTrade } from "../../crypto/trade-logger";
import {
  openPosition,
  closePosition,
  getPositionForSymbol,
  getOpenPositionSummaries,
} from "../../crypto/positions";

export const cryptoTradeTool: RichyToolDef = {
  name: "crypto_trade",
  displayName: "Crypto Trading",
  description:
    "Interact with cryptocurrency exchanges. Get prices, view portfolio, place orders, check order status, cancel orders, get market info, and view price history. Configure exchange API keys in Settings > Trading.",
  category: "system",
  parameters: z.object({
    action: z
      .enum([
        "get_price",
        "get_portfolio",
        "place_order",
        "get_order_status",
        "cancel_order",
        "get_market_info",
        "get_price_history",
        "get_positions",
      ])
      .describe("Action to perform"),
    symbol: z
      .string()
      .optional()
      .describe("Trading pair symbol, e.g. 'BTC/USDT', 'ETH/USD'"),
    side: z
      .enum(["buy", "sell"])
      .optional()
      .describe("Order side (for place_order)"),
    order_type: z
      .enum(["market", "limit"])
      .optional()
      .describe("Order type (for place_order)"),
    amount: z
      .number()
      .optional()
      .describe("Amount of base currency to trade (for place_order). Note: on Coinbase, market buy orders are automatically converted to quote currency (USD)."),
    quote_amount: z
      .number()
      .optional()
      .describe("Amount in quote currency / USD to spend (for market buy orders). Alternative to 'amount' — specify how many dollars to spend instead of how much crypto to buy."),
    price: z
      .number()
      .optional()
      .describe("Limit price (required for limit orders)"),
    confirm: z
      .boolean()
      .optional()
      .describe(
        "Set to true to confirm and execute a trade. First call without confirm to preview."
      ),
    order_id: z
      .string()
      .optional()
      .describe("Order ID (for get_order_status, cancel_order)"),
    timeframe: z
      .string()
      .optional()
      .describe(
        "Candle timeframe: '1m', '5m', '15m', '1h', '4h', '1d' (for get_price_history, default '1h')"
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "Number of candles to fetch (for get_price_history, default 24)"
      ),
    source: z
      .enum(["sentinel", "user", "stop_loss", "take_profit"])
      .optional()
      .describe("Source of the trade (for logging)"),
    stop_loss: z
      .number()
      .optional()
      .describe("Stop-loss price for the position"),
    take_profit: z
      .number()
      .optional()
      .describe("Take-profit price for the position"),
    reasoning: z
      .string()
      .optional()
      .describe("Reasoning for the trade (for logging)"),
  }),
  execute: async (input: {
    action: string;
    symbol?: string;
    side?: "buy" | "sell";
    order_type?: "market" | "limit";
    amount?: number;
    quote_amount?: number;
    price?: number;
    confirm?: boolean;
    order_id?: string;
    timeframe?: string;
    limit?: number;
    source?: "sentinel" | "user" | "stop_loss" | "take_profit";
    stop_loss?: number;
    take_profit?: number;
    reasoning?: string;
  }) => {
    // ─── Get Price ────────────────────────────────────────────────────
    if (input.action === "get_price") {
      if (!input.symbol) {
        return {
          success: false,
          output: "symbol is required for get_price (e.g. 'BTC/USDT')",
        };
      }
      try {
        const exchange = getExchange();
        const ticker = await exchange.fetchTicker(input.symbol);
        return {
          success: true,
          output:
            `${input.symbol}: $${ticker.last} | ` +
            `24h: ${ticker.percentage !== undefined ? ticker.percentage.toFixed(2) + "%" : "N/A"} | ` +
            `High: $${ticker.high} | Low: $${ticker.low} | ` +
            `Volume: ${ticker.baseVolume}`,
          data: {
            symbol: input.symbol,
            price: ticker.last,
            change24h: ticker.percentage,
            high24h: ticker.high,
            low24h: ticker.low,
            volume: ticker.baseVolume,
            bid: ticker.bid,
            ask: ticker.ask,
            timestamp: ticker.timestamp,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to get price for ${input.symbol}: ${error.message}`,
        };
      }
    }

    // ─── Get Portfolio ────────────────────────────────────────────────
    if (input.action === "get_portfolio") {
      try {
        const exchange = getExchange();
        const balance = await exchange.fetchBalance();
        const totalBalances = (balance.total || {}) as unknown as Record<string, number>;
        const freeBalances = (balance.free || {}) as unknown as Record<string, number>;
        const holdings = Object.entries(totalBalances)
          .filter(([, v]) => v > 0)
          .map(([currency, amount]) => ({
            currency,
            amount,
            free: freeBalances[currency] || 0,
          }));

        if (holdings.length === 0) {
          return {
            success: true,
            output: "Portfolio is empty — no holdings found.",
            data: { holdings: [] },
          };
        }

        const formatted = holdings
          .map((h) => `- ${h.currency}: ${h.amount} (available: ${h.free})`)
          .join("\n");

        return {
          success: true,
          output: `Portfolio (${holdings.length} assets):\n${formatted}`,
          data: { holdings },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to fetch portfolio: ${error.message}`,
        };
      }
    }

    // ─── Place Order ──────────────────────────────────────────────────
    if (input.action === "place_order") {
      if (!input.symbol || !input.side || !input.order_type || (!input.amount && !input.quote_amount)) {
        return {
          success: false,
          output:
            "Required fields for place_order: symbol, side, order_type, and either amount (base currency) or quote_amount (USD to spend)",
        };
      }

      if (!isTradingEnabled()) {
        return {
          success: false,
          output:
            "Trading is disabled. Enable it in Settings > Trading before placing orders.",
        };
      }

      // Validate symbol format (must be BASE/QUOTE like BTC/USD)
      if (!/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/i.test(input.symbol)) {
        return {
          success: false,
          output: `Invalid symbol format "${input.symbol}". Use BASE/QUOTE format like BTC/USD or ETH/USDT.`,
        };
      }

      // Validate amounts are positive and finite
      if (input.amount !== undefined && (input.amount <= 0 || !isFinite(input.amount))) {
        return {
          success: false,
          output: "amount must be a positive finite number",
        };
      }
      if (input.quote_amount !== undefined && (input.quote_amount <= 0 || !isFinite(input.quote_amount))) {
        return {
          success: false,
          output: "quote_amount must be a positive finite number",
        };
      }
      if (input.price !== undefined && (input.price <= 0 || !isFinite(input.price))) {
        return {
          success: false,
          output: "price must be a positive finite number",
        };
      }

      if (
        input.order_type === "limit" &&
        (input.price === undefined || input.price === null)
      ) {
        return {
          success: false,
          output: "price is required for limit orders",
        };
      }

      try {
        const exchange = getExchange();
        const exchangeId = exchange.id; // e.g. "coinbase", "binance"
        const isCoinbase = exchangeId === "coinbase" || exchangeId === "coinbaseadvanced";

        // Fetch current price for estimates and Coinbase conversion
        const ticker = await exchange.fetchTicker(input.symbol);
        const estimatedPrice = ticker.last || 0;

        // Determine the actual order amount and USD value
        // Coinbase quirk: market buy orders expect amount in QUOTE currency (USD),
        // not base currency (BTC). We handle this transparently.
        let orderAmount: number;
        let estimatedUsdValue: number;
        let coinbaseMarketBuy = false;

        if (input.quote_amount) {
          // User specified USD amount directly
          estimatedUsdValue = input.quote_amount;
          if (isCoinbase && input.order_type === "market" && input.side === "buy") {
            // Coinbase: pass USD amount directly as the "amount" param
            orderAmount = input.quote_amount;
            coinbaseMarketBuy = true;
          } else {
            // Other exchanges: convert USD to base currency amount
            if (estimatedPrice <= 0) {
              return {
                success: false,
                output: "Cannot determine current price to convert quote_amount to base amount.",
              };
            }
            orderAmount = input.quote_amount / estimatedPrice;
          }
        } else {
          // User specified base currency amount
          orderAmount = input.amount!;
          estimatedUsdValue = estimatedPrice * orderAmount;

          if (isCoinbase && input.order_type === "market" && input.side === "buy") {
            // Coinbase market buy: convert base amount to quote (USD) amount
            orderAmount = estimatedUsdValue;
            coinbaseMarketBuy = true;
          }
        }

        const maxUsd = getMaxTradeUsd();

        if (estimatedUsdValue > maxUsd) {
          return {
            success: false,
            output:
              `Trade value ~$${estimatedUsdValue.toFixed(2)} exceeds your maximum of $${maxUsd}. ` +
              `Adjust crypto_max_trade_usd in Settings > Trading to increase the limit.`,
          };
        }

        // Preview mode (default — requires explicit confirmation)
        if (!input.confirm) {
          const baseAmount = coinbaseMarketBuy
            ? (estimatedPrice > 0 ? estimatedUsdValue / estimatedPrice : 0)
            : orderAmount;

          return {
            success: true,
            output:
              `ORDER PREVIEW (not yet executed):\n` +
              `${input.side.toUpperCase()} ${input.symbol} (${input.order_type})\n` +
              (coinbaseMarketBuy
                ? `Spending: ~$${estimatedUsdValue.toFixed(2)} USD\n` +
                  `Estimated quantity: ~${baseAmount.toFixed(8)} ${input.symbol.split("/")[0]}\n`
                : `Amount: ${orderAmount} ${input.symbol.split("/")[0]}\n` +
                  `Estimated value: ~$${estimatedUsdValue.toFixed(2)}\n`) +
              `Estimated price: $${estimatedPrice}\n` +
              (input.order_type === "limit"
                ? `Limit price: $${input.price}\n`
                : "") +
              (coinbaseMarketBuy
                ? `Note: Coinbase market buys use quote currency (USD amount)\n`
                : "") +
              `Sandbox mode: ${(exchange as any).sandbox ? "YES (testnet)" : "NO (REAL MONEY)"}\n\n` +
              `To execute this order, call again with confirm: true`,
            data: {
              preview: true,
              side: input.side,
              symbol: input.symbol,
              amount: baseAmount,
              orderAmount,
              type: input.order_type,
              estimatedPrice,
              estimatedValue: estimatedUsdValue,
              limitPrice: input.price,
              coinbaseMarketBuy,
              sandbox: !!(exchange as any).sandbox,
            },
          };
        }

        // Enforce daily safety limits (always, regardless of sentinel state)
        {
          const dailyState = getDailyState();
          const maxTrades = parseInt(
            getSettingSync("crypto_sentinel_max_trades_per_day") || "5",
            10
          );
          const lossLimit = parseInt(
            getSettingSync("crypto_sentinel_daily_loss_limit_usd") || "50",
            10
          );

          if (dailyState.trades_today >= maxTrades) {
            return {
              success: false,
              output:
                `Daily trade limit reached (${dailyState.trades_today}/${maxTrades}). ` +
                `No more trades allowed today. Adjust in Settings > Trading > Sentinel.`,
            };
          }

          if (dailyState.pnl_today <= -lossLimit) {
            return {
              success: false,
              output:
                `Daily loss limit reached (P&L: $${dailyState.pnl_today.toFixed(2)}, limit: -$${lossLimit}). ` +
                `No more trades allowed today. Adjust in Settings > Trading > Sentinel.`,
            };
          }
        }

        // Execute the order
        const order = await exchange.createOrder(
          input.symbol,
          input.order_type,
          input.side,
          orderAmount,
          input.order_type === "limit" ? input.price : undefined
        );

        // ─── Log trade and manage positions ────────────────────────
        const fillPrice = order.average || order.price || estimatedPrice;
        const fillAmount = order.filled || order.amount || (coinbaseMarketBuy ? estimatedUsdValue / estimatedPrice : orderAmount);
        const fillCost = order.cost || fillPrice * (fillAmount || 0);
        const isSandbox = !!(exchange as any).sandbox;

        let tradeId: string | undefined;
        try {
          tradeId = await logTrade({
            symbol: input.symbol,
            side: input.side,
            orderType: input.order_type,
            amount: fillAmount || 0,
            price: fillPrice,
            cost: fillCost,
            orderId: order.id,
            source: input.source ?? "user",
            reasoning: input.reasoning,
            sandbox: isSandbox,
          });
        } catch (err: any) {
          console.error("[Richy:Trade] Failed to log trade:", err.message);
        }

        // Position management — capture entry price BEFORE closing for P&L calc
        let positionInfo = "";
        let realizedPnl = 0;
        try {
          if (input.side === "buy" && fillAmount && fillPrice) {
            const posId = await openPosition({
              symbol: input.symbol,
              side: "long",
              entryPrice: fillPrice,
              amount: fillAmount,
              costBasis: fillCost,
              stopLoss: input.stop_loss,
              takeProfit: input.take_profit,
              entryTradeId: tradeId,
            });
            positionInfo = `\nPosition opened: ${posId}`;
            if (tradeId) {
              // Link trade to position
              const { db: database, schema: s } = await import("../../db");
              const { eq } = await import("drizzle-orm");
              await database
                .update(s.tradeHistory)
                .set({ positionId: posId })
                .where(eq(s.tradeHistory.id, tradeId));
            }
          } else if (input.side === "sell" && fillPrice) {
            const existing = await getPositionForSymbol(input.symbol);
            if (existing) {
              realizedPnl = (fillPrice - existing.entryPrice) * existing.amount;
              await closePosition({
                positionId: existing.id,
                exitTradeId: tradeId,
                exitPrice: fillPrice,
              });
              positionInfo = `\nPosition closed: ${existing.id} | P&L: ${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)}`;
            }
          }
        } catch (err: any) {
          console.error("[Richy:Trade] Position management error:", err.message);
        }

        // Update daily state (always — safety limits apply regardless of sentinel)
        {
          const dailyState = getDailyState();
          dailyState.trades_today += 1;
          dailyState.pnl_today += realizedPnl;
          await saveDailyState(dailyState);
        }

        const displayAmount = coinbaseMarketBuy
          ? `~$${estimatedUsdValue.toFixed(2)} of`
          : `${order.amount}`;

        return {
          success: true,
          output:
            `Order placed successfully!\n` +
            `Order ID: ${order.id}\n` +
            `${input.side.toUpperCase()} ${displayAmount} ${input.symbol} @ ${input.order_type}\n` +
            `Status: ${order.status}\n` +
            `Filled: ${order.filled || 0}${order.amount ? ` / ${order.amount}` : ""}\n` +
            (order.price ? `Price: $${order.price}\n` : "") +
            (coinbaseMarketBuy ? "(Coinbase market buy — amount in USD)\n" : "") +
            (isSandbox ? "(SANDBOX MODE — testnet)" : "(LIVE TRADE)") +
            positionInfo,
          data: {
            orderId: order.id,
            tradeId,
            status: order.status,
            side: input.side,
            symbol: input.symbol,
            amount: order.amount,
            type: input.order_type,
            price: order.price,
            filled: order.filled,
            remaining: order.remaining,
            cost: order.cost,
            coinbaseMarketBuy,
            sandbox: isSandbox,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Order failed: ${error.message}`,
        };
      }
    }

    // ─── Get Order Status ─────────────────────────────────────────────
    if (input.action === "get_order_status") {
      if (!input.order_id) {
        return {
          success: false,
          output: "order_id is required for get_order_status",
        };
      }
      try {
        const exchange = getExchange();
        const order = await exchange.fetchOrder(
          input.order_id,
          input.symbol || undefined
        );
        return {
          success: true,
          output:
            `Order ${order.id}:\n` +
            `${order.side?.toUpperCase()} ${order.amount} ${order.symbol} (${order.type})\n` +
            `Status: ${order.status}\n` +
            `Filled: ${order.filled} / ${order.amount}\n` +
            (order.price ? `Price: $${order.price}\n` : "") +
            (order.average ? `Average fill: $${order.average}\n` : "") +
            `Created: ${order.datetime}`,
          data: {
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            status: order.status,
            amount: order.amount,
            filled: order.filled,
            remaining: order.remaining,
            price: order.price,
            average: order.average,
            cost: order.cost,
            datetime: order.datetime,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to get order status: ${error.message}`,
        };
      }
    }

    // ─── Cancel Order ─────────────────────────────────────────────────
    if (input.action === "cancel_order") {
      if (!input.order_id) {
        return {
          success: false,
          output: "order_id is required for cancel_order",
        };
      }
      try {
        const exchange = getExchange();
        await exchange.cancelOrder(
          input.order_id,
          input.symbol || undefined
        );
        return {
          success: true,
          output: `Order ${input.order_id} cancelled successfully.`,
          data: { orderId: input.order_id, cancelled: true },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to cancel order: ${error.message}`,
        };
      }
    }

    // ─── Get Market Info ──────────────────────────────────────────────
    if (input.action === "get_market_info") {
      try {
        const exchange = getExchange();
        const markets = await exchange.loadMarkets();
        const pairs = Object.keys(markets);

        // If symbol is specified, return info about that pair
        if (input.symbol && markets[input.symbol]) {
          const mkt = markets[input.symbol]!;
          return {
            success: true,
            output:
              `${input.symbol} market info:\n` +
              `Base: ${mkt.base} | Quote: ${mkt.quote}\n` +
              `Active: ${mkt.active}\n` +
              (mkt.limits?.amount
                ? `Amount limits: ${mkt.limits.amount.min} - ${mkt.limits.amount.max}\n`
                : "") +
              (mkt.limits?.price
                ? `Price limits: ${mkt.limits.price.min} - ${mkt.limits.price.max}\n`
                : "") +
              (mkt.precision
                ? `Precision: amount=${mkt.precision.amount}, price=${mkt.precision.price}\n`
                : ""),
            data: {
              symbol: input.symbol,
              base: mkt.base,
              quote: mkt.quote,
              active: mkt.active,
              limits: mkt.limits,
              precision: mkt.precision,
            },
          };
        }

        // Otherwise list popular pairs
        const popularQuotes = ["USDT", "USD", "USDC", "BTC"];
        const popularPairs = pairs
          .filter((p) => {
            const mkt = markets[p];
            return (
              mkt?.active &&
              popularQuotes.some((q) => p.endsWith("/" + q))
            );
          })
          .slice(0, 50);

        return {
          success: true,
          output: `${exchange.id} has ${pairs.length} markets. Popular pairs:\n${popularPairs.join(", ")}`,
          data: {
            exchangeId: exchange.id,
            totalPairs: pairs.length,
            popularPairs,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to load markets: ${error.message}`,
        };
      }
    }

    // ─── Get Price History ────────────────────────────────────────────
    if (input.action === "get_price_history") {
      if (!input.symbol) {
        return {
          success: false,
          output:
            "symbol is required for get_price_history (e.g. 'BTC/USDT')",
        };
      }
      try {
        const exchange = getExchange();
        const timeframe = input.timeframe || "1h";
        const limit = input.limit || 24;

        const ohlcv = await exchange.fetchOHLCV(
          input.symbol,
          timeframe,
          undefined,
          limit
        );

        if (!ohlcv || ohlcv.length === 0) {
          return {
            success: true,
            output: `No price history available for ${input.symbol} (${timeframe})`,
            data: { candles: [] },
          };
        }

        const candles = ohlcv.map(
          ([timestamp, open, high, low, close, volume]) => ({
            timestamp,
            time: new Date(timestamp as number).toISOString(),
            open,
            high,
            low,
            close,
            volume,
          })
        );

        const latest = candles[candles.length - 1];
        const earliest = candles[0];
        const formatted = candles
          .map(
            (c) =>
              `${new Date(c.timestamp as number).toLocaleString()}: O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`
          )
          .join("\n");

        return {
          success: true,
          output:
            `${input.symbol} ${timeframe} candles (${candles.length}):\n` +
            `Range: ${earliest.time} → ${latest.time}\n\n` +
            formatted,
          data: {
            symbol: input.symbol,
            timeframe,
            candles,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to fetch price history: ${error.message}`,
        };
      }
    }

    // ─── Get Positions ─────────────────────────────────────────────────
    if (input.action === "get_positions") {
      try {
        const positions = await getOpenPositionSummaries();
        if (positions.length === 0) {
          return {
            success: true,
            output: "No open positions.",
            data: { positions: [] },
          };
        }

        const formatted = positions
          .map((p) => {
            const pnlStr = p.unrealizedPnl !== undefined
              ? `P&L: ${p.unrealizedPnl >= 0 ? "+" : ""}$${p.unrealizedPnl.toFixed(2)} (${p.unrealizedPnlPct?.toFixed(1)}%)`
              : "P&L: N/A";
            const slStr = p.stopLoss ? `SL: $${p.stopLoss.toFixed(2)}` : "SL: none";
            const tpStr = p.takeProfit ? `TP: $${p.takeProfit.toFixed(2)}` : "TP: none";
            const priceStr = p.currentPrice ? `Current: $${p.currentPrice.toFixed(2)}` : "";
            return `- ${p.symbol} ${p.side.toUpperCase()} | ${p.amount} @ $${p.entryPrice.toFixed(2)} | ${priceStr} | ${pnlStr} | ${slStr} | ${tpStr}`;
          })
          .join("\n");

        return {
          success: true,
          output: `Open positions (${positions.length}):\n${formatted}`,
          data: { positions },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to get positions: ${error.message}`,
        };
      }
    }

    return {
      success: false,
      output: `Invalid action "${input.action}". Use: get_price, get_portfolio, place_order, get_order_status, cancel_order, get_market_info, get_price_history, get_positions`,
    };
  },
};
