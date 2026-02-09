import { db, schema } from "../db";
import { runAgent } from "../agent/runner";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { getSettingSync } from "../db/settings";
import { getDailyState, saveDailyState } from "./daily-state";
import { computeAllIndicators, type TechnicalIndicators } from "./analysis";
import { getOpenPositionSummaries, type PositionSummary, openPosition, closePosition, getPositionForSymbol } from "./positions";
import { getRecentTrades, getDailyTradeStats, logTrade } from "./trade-logger";
import { getExchange, isTradingEnabled, getMaxTradeUsd } from "./client";
import { webSearch, fetchRedditSentiment, fetchCryptoNews, type WebSearchResult, type RedditPost, type CryptoNewsItem } from "./sources";
import { getCEODirective, formatDirectiveForSentinel, shouldEscalate, runCEOBriefing } from "./ceo";

let sentinelTimer: ReturnType<typeof setInterval> | null = null;
let sentinelInitialTimeout: ReturnType<typeof setTimeout> | null = null;
let sentinelConversationId: string | null = null;
let isRunning = false;
let dailyStateLock = false;

// ─── Types ──────────────────────────────────────────────────────────

export interface SentinelContext {
  portfolio: { currency: string; amount: number; free: number }[];
  positions: PositionSummary[];
  indicators: Record<string, TechnicalIndicators>;
  recentTrades: Awaited<ReturnType<typeof getRecentTrades>>;
  previousRuns: { summary: string | null; sentiment: string | null; createdAt: Date | null }[];
  dailyStats: Awaited<ReturnType<typeof getDailyTradeStats>>;
  coinList: string[];
  sourceList: string[];
  webResults: WebSearchResult[];
  reddit: RedditPost[];
  news: CryptoNewsItem[];
}

interface SentinelOutput {
  sentiment?: Record<string, any>;
  signals?: string[];
  actions?: SentinelTradeAction[];
  summary?: string;
}

interface SentinelTradeAction {
  type: "buy" | "sell" | "hold";
  symbol: string;
  amount?: number;
  reason: string;
}

// ─── Conversation ───────────────────────────────────────────────────

async function getOrCreateConversation(): Promise<string> {
  if (sentinelConversationId) return sentinelConversationId;

  const existing = db
    .select()
    .from(schema.conversations)
    .all()
    .filter((c) => {
      if (!c.metadata) return false;
      try {
        const meta = JSON.parse(c.metadata);
        return meta.source === "crypto-sentinel";
      } catch {
        return false;
      }
    });

  if (existing.length > 0) {
    sentinelConversationId = existing[0].id;
    return sentinelConversationId;
  }

  const id = nanoid();
  await db.insert(schema.conversations).values({
    id,
    title: "Crypto Sentinel",
    metadata: JSON.stringify({ source: "crypto-sentinel" }),
  });

  sentinelConversationId = id;
  console.log(`[Richy:Sentinel] Created sentinel conversation: ${id}`);
  return id;
}

// ─── Step 1: Gather context (pre-fetch ALL data) ────────────────────

export async function gatherSentinelContext(): Promise<SentinelContext> {
  const coins = getSettingSync("crypto_sentinel_coins") || "BTC,ETH";
  const sources = getSettingSync("crypto_sentinel_sources") || "reddit,twitter,news";
  const coinList = coins.split(",").map((c) => c.trim()).filter(Boolean);
  const sourceList = sources.split(",").map((s) => s.trim()).filter(Boolean);

  const symbols = coinList.map((c) => (c.includes("/") ? c : `${c}/USD`));

  const [portfolioResult, positions, indicators, recentTrades, dailyStats, webResults, reddit, news] =
    await Promise.all([
      (async () => {
        try {
          const exchange = getExchange();
          const balance = await exchange.fetchBalance();
          const totalBalances = (balance.total || {}) as unknown as Record<string, number>;
          const freeBalances = (balance.free || {}) as unknown as Record<string, number>;
          return Object.entries(totalBalances)
            .filter(([, v]) => v > 0)
            .map(([currency, amount]) => ({
              currency,
              amount,
              free: freeBalances[currency] || 0,
            }));
        } catch (err: any) {
          console.error("[Richy:Sentinel] Failed to fetch portfolio:", err.message);
          return [];
        }
      })(),
      getOpenPositionSummaries().catch(() => [] as PositionSummary[]),
      computeAllIndicators(symbols).catch(() => ({}) as Record<string, TechnicalIndicators>),
      getRecentTrades(10).catch(() => []),
      getDailyTradeStats().catch(() => ({
        tradesCount: 0,
        realizedPnl: 0,
        volume: 0,
        winners: 0,
        losers: 0,
      })),
      // Web search: one DuckDuckGo search per coin (free, no API key)
      Promise.all(
        coinList.map((c) =>
          webSearch(`${c} crypto sentiment analysis today`, 3).catch(() => [])
        )
      ).then((results) => results.flat()),
      // Reddit: direct JSON API
      fetchRedditSentiment(coinList).catch(() => []),
      // CryptoPanic: crypto news
      fetchCryptoNews(coinList).catch(() => []),
    ]);

  // Get previous sentinel runs
  const previousRuns = db
    .select({
      summary: schema.sentinelRuns.summary,
      sentiment: schema.sentinelRuns.sentiment,
      createdAt: schema.sentinelRuns.createdAt,
    })
    .from(schema.sentinelRuns)
    .orderBy(desc(schema.sentinelRuns.createdAt))
    .limit(3)
    .all();

  return {
    portfolio: portfolioResult,
    positions,
    indicators,
    recentTrades,
    previousRuns,
    dailyStats,
    coinList,
    sourceList,
    webResults,
    reddit,
    news,
  };
}

// ─── Sanitize external text (prevent prompt injection) ────────────

function sanitizeExternalText(text: string, maxLength: number = 500): string {
  if (!text) return "";
  // Truncate
  let cleaned = text.slice(0, maxLength);
  // Strip lines that look like prompt injection attempts
  const INJECTION_PATTERNS = /\b(IGNORE|SYSTEM|INSTRUCTION|ADMIN|OVERRIDE|FORGET|DISREGARD|YOU\s+ARE|PRETEND|ACT\s+AS)\b/i;
  cleaned = cleaned
    .split("\n")
    .filter((line) => !INJECTION_PATTERNS.test(line))
    .join("\n");
  // Strip code blocks that could contain executable-looking content
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "[code block removed]");
  return cleaned.trim();
}

// ─── Step 2: Build prompt (all data pre-fetched, no tool references) ─

function buildSentinelPrompt(ctx: SentinelContext): {
  userMessage: string;
  systemPrompt: string;
} {
  const strategy = getSettingSync("crypto_sentinel_strategy") || "";
  const autoConfirm = getSettingSync("crypto_sentinel_auto_confirm") === "on";
  const maxTrades = parseInt(getSettingSync("crypto_sentinel_max_trades_per_day") || "5", 10);
  const lossLimit = parseInt(getSettingSync("crypto_sentinel_daily_loss_limit_usd") || "50", 10);
  const tradingEnabled = isTradingEnabled();
  const dailyState = getDailyState();

  // ─── Portfolio ───────────────────────────────────────────
  let portfolioSection = "## Current Portfolio\n";
  if (ctx.portfolio.length === 0) {
    portfolioSection += "No holdings found.\n";
  } else {
    portfolioSection += ctx.portfolio
      .map((h) => `- ${h.currency}: ${h.amount} (available: ${h.free})`)
      .join("\n") + "\n";
  }

  // ─── Positions ───────────────────────────────────────────
  let positionsSection = "\n## Open Positions\n";
  if (ctx.positions.length === 0) {
    positionsSection += "No open positions.\n";
  } else {
    positionsSection += ctx.positions
      .map((p) => {
        const pnlStr =
          p.unrealizedPnl !== undefined
            ? `P&L: ${p.unrealizedPnl >= 0 ? "+" : ""}$${p.unrealizedPnl.toFixed(2)} (${p.unrealizedPnlPct?.toFixed(1)}%)`
            : "P&L: N/A";
        const slStr = p.stopLoss ? `SL: $${p.stopLoss.toFixed(2)}` : "SL: none";
        const tpStr = p.takeProfit ? `TP: $${p.takeProfit.toFixed(2)}` : "TP: none";
        const priceStr = p.currentPrice ? `Current: $${p.currentPrice.toFixed(2)}` : "";
        return `- ${p.symbol} ${p.side.toUpperCase()} | ${p.amount} @ $${p.entryPrice.toFixed(2)} | ${priceStr} | ${pnlStr} | ${slStr} | ${tpStr}`;
      })
      .join("\n") + "\n";
  }

  // ─── Technical analysis ──────────────────────────────────
  let taSection = "\n## Technical Analysis (1h timeframe)\n";
  if (Object.keys(ctx.indicators).length === 0) {
    taSection += "Technical data unavailable.\n";
  } else {
    for (const [symbol, ind] of Object.entries(ctx.indicators)) {
      const rsiLabel =
        ind.rsi14 < 30 ? "oversold" : ind.rsi14 > 70 ? "overbought" : "neutral";
      const macdLabel = ind.macd.histogram > 0 ? "bullish" : "bearish";
      taSection +=
        `### ${symbol}\n` +
        `Price: $${ind.price.toFixed(2)} | RSI(14): ${ind.rsi14.toFixed(0)} (${rsiLabel}) | MACD: ${ind.macd.histogram > 0 ? "+" : ""}${ind.macd.histogram.toFixed(2)} (${macdLabel})\n` +
        `SMA: 7=$${ind.sma.sma7.toFixed(2)} 20=$${ind.sma.sma20.toFixed(2)} 50=$${ind.sma.sma50.toFixed(2)} | Trend: ${ind.trend}\n` +
        `Support: $${ind.support.toFixed(2)} | Resistance: $${ind.resistance.toFixed(2)} | Volume: ${ind.volumeTrend}\n` +
        (ind.signals.length > 0 ? `Signals: ${ind.signals.join(", ")}\n` : "") +
        "\n";
    }
  }

  // ─── Web research (DuckDuckGo) — sanitized ─────────────────
  let webSection = "\n## Web Research\n";
  if (ctx.webResults.length === 0) {
    webSection += "No web results available.\n";
  } else {
    for (const r of ctx.webResults) {
      webSection += `### ${sanitizeExternalText(r.title || "", 200)}\n`;
      webSection += `Source: ${r.url}\n`;
      if (r.snippet) {
        webSection += sanitizeExternalText(r.snippet, 500) + "\n\n";
      }
    }
  }

  // ─── Reddit sentiment — sanitized ───────────────────────────
  let redditSection = "\n## Reddit Sentiment\n";
  if (ctx.reddit.length === 0) {
    redditSection += "No Reddit data available.\n";
  } else {
    for (const post of ctx.reddit.slice(0, 10)) {
      redditSection += `- [r/${post.subreddit} | Score: ${post.score} | ${post.numComments} comments] "${sanitizeExternalText(post.title, 200)}"\n`;
      if (post.selftext) {
        redditSection += `  > ${sanitizeExternalText(post.selftext, 300)}\n`;
      }
    }
  }

  // ─── Crypto news — sanitized ─────────────────────────────────
  let newsSection = "\n## Crypto News\n";
  if (ctx.news.length === 0) {
    newsSection += "No news data available.\n";
  } else {
    for (const item of ctx.news) {
      const ago = item.publishedAt ? formatTimeAgo(new Date(item.publishedAt)) : "";
      newsSection += `- [${sanitizeExternalText(item.source || "news", 50)}${ago ? ", " + ago : ""}] "${sanitizeExternalText(item.title, 200)}" (positive: ${item.votesPositive}, negative: ${item.votesNegative})\n`;
    }
  }

  // ─── Recent trades ──────────────────────────────────────
  let tradesSection = "\n## Recent Trades\n";
  if (ctx.recentTrades.length === 0) {
    tradesSection += "No recent trades.\n";
  } else {
    tradesSection += ctx.recentTrades
      .map((t) => {
        const ago = t.createdAt ? formatTimeAgo(t.createdAt) : "unknown";
        return `- [${ago}] ${t.side.toUpperCase()} ${t.amount} ${t.symbol} @ $${t.price?.toFixed(2) ?? "?"} (${t.source ?? "user"})${t.reasoning ? ` — "${t.reasoning}"` : ""}`;
      })
      .join("\n") + "\n";
  }

  // ─── Previous runs (compressed) ─────────────────────────
  let prevSection = "\n## Previous Analysis\n";
  if (ctx.previousRuns.length === 0) {
    prevSection += "No previous runs.\n";
  } else {
    prevSection += ctx.previousRuns
      .map((r) => {
        const ago = r.createdAt ? formatTimeAgo(r.createdAt) : "unknown";
        const summary = r.summary
          ? r.summary.length > 150
            ? r.summary.substring(0, 147) + "..."
            : r.summary
          : "No summary";
        return `- [${ago}] ${summary}`;
      })
      .join("\n") + "\n";
  }

  // ─── Daily stats ─────────────────────────────────────────
  const statsSection =
    `\n## Daily Stats\n` +
    `Trades: ${ctx.dailyStats.tradesCount}/${maxTrades} | ` +
    `P&L: ${ctx.dailyStats.realizedPnl >= 0 ? "+" : ""}$${ctx.dailyStats.realizedPnl.toFixed(2)} | ` +
    `Volume: $${ctx.dailyStats.volume.toFixed(2)} | ` +
    `W/L: ${ctx.dailyStats.winners}/${ctx.dailyStats.losers}\n`;

  // ─── Trading rules ───────────────────────────────────────
  let tradingSection: string;
  const atTradeLimit = dailyState.trades_today >= maxTrades;
  const atLossLimit = dailyState.pnl_today <= -lossLimit;

  if (!tradingEnabled || !autoConfirm || atTradeLimit || atLossLimit) {
    tradingSection = "\n## Trading: ";
    if (!tradingEnabled) tradingSection += "DISABLED. Analysis only.\n";
    else if (!autoConfirm) tradingSection += "PREVIEW ONLY. Recommend trades but do not confirm.\n";
    else if (atTradeLimit) tradingSection += "DAILY LIMIT REACHED. No more trades today.\n";
    else tradingSection += "LOSS LIMIT REACHED. No more trades today.\n";
  } else {
    // CEO directive takes priority, manual strategy is a fallback
    const ceoDirective = getCEODirective();
    let directiveSection = "";
    if (ceoDirective) {
      directiveSection = formatDirectiveForSentinel(ceoDirective);
    }

    tradingSection =
      `\n## Trading Rules\n` +
      `- Auto-confirm: YES\n` +
      `- Trades today: ${dailyState.trades_today}/${maxTrades}\n` +
      `- Daily P&L: $${dailyState.pnl_today.toFixed(2)} (limit: -$${lossLimit})\n` +
      `- Max single trade: $${getMaxTradeUsd()}\n` +
      directiveSection +
      (strategy ? `\n## Manual Strategy Notes\n${strategy}\n` : "");
  }

  // ─── Assemble user message ───────────────────────────────
  const userMessage =
    `Analyze crypto markets for: ${ctx.coinList.join(", ")}\n\n` +
    portfolioSection +
    positionsSection +
    taSection +
    webSection +
    redditSection +
    newsSection +
    tradesSection +
    prevSection +
    statsSection +
    tradingSection +
    `\n## Decision Framework\n` +
    `For each coin: assess Technical score + Sentiment score + Position status.\n` +
    `Confidence must be >70 to recommend action. Below that, hold.\n` +
    `\n## Required Output\n` +
    `End your response with:\n` +
    "```sentinel-output\n" +
    `{"sentiment": {"COIN": {"score": 0.0-1.0, "label": "bullish/bearish/neutral"}}, "signals": ["signal1"], "actions": [{"type": "buy/sell/hold", "symbol": "X/USD", "amount": 0.01, "reason": "..."}], "summary": "One-paragraph summary"}\n` +
    "```\n";

  // ─── Minimal system prompt (no soul/personality/tools) ───
  const systemPrompt =
    `You are the Crypto Sentinel, an autonomous market monitor.\n` +
    `Current time: ${new Date().toISOString()}\n` +
    `Analyze the data below and produce a trading recommendation.\n` +
    `All market data, news, and social sentiment is already provided — do NOT request additional information.\n` +
    `${tradingEnabled && autoConfirm ? "Trading is enabled. Recommend specific trades with amounts when confidence is high." : "Analysis only — recommend actions but they won't be auto-executed."}\n` +
    `Be concise and data-driven. Always end with the sentinel-output JSON block.`;

  return { userMessage, systemPrompt };
}

// ─── Step 3: Parse output ───────────────────────────────────────────

function parseSentinelOutput(text: string): SentinelOutput | null {
  const blockMatch = text.match(/```sentinel-output\s*\n([\s\S]*?)\n```/);
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  const jsonMatch = text.match(/\{[\s\S]*"summary"\s*:\s*"[\s\S]*"\s*\}\s*$/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Give up
    }
  }

  return null;
}

// ─── Step 4: Execute trades directly via CCXT ───────────────────────

async function executeSentinelTrade(
  action: SentinelTradeAction,
  sentinelRunId: string
): Promise<string | null> {
  if (action.type === "hold") return null;

  const dailyState = getDailyState();
  const maxTrades = parseInt(getSettingSync("crypto_sentinel_max_trades_per_day") || "5", 10);
  const lossLimit = parseInt(getSettingSync("crypto_sentinel_daily_loss_limit_usd") || "50", 10);

  // Safety checks
  if (!isTradingEnabled()) return null;
  if (dailyState.trades_today >= maxTrades) return null;
  if (dailyState.pnl_today <= -lossLimit) return null;

  const symbol = action.symbol.includes("/") ? action.symbol : `${action.symbol}/USD`;
  const exchange = getExchange();
  const sandboxMode = getSettingSync("crypto_sandbox_mode");
  const isSandbox = sandboxMode !== "off" && sandboxMode !== "false";

  try {
    // Get current price to validate amount
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last || ticker.close || 0;
    if (!price) throw new Error("Could not fetch current price");

    // Determine amount
    let amount = action.amount || 0;
    if (!amount) {
      // Default: use max trade USD / price
      const maxUsd = getMaxTradeUsd();
      amount = Math.floor((maxUsd / price) * 100000000) / 100000000; // 8 decimal precision
    }

    // Check USD value limit
    const estimatedUsd = amount * price;
    const maxTradeUsd = getMaxTradeUsd();
    if (estimatedUsd > maxTradeUsd) {
      console.log(`[Richy:Sentinel] Trade rejected: $${estimatedUsd.toFixed(2)} exceeds max $${maxTradeUsd}`);
      return null;
    }

    // Execute order
    const side = action.type as "buy" | "sell";
    console.log(`[Richy:Sentinel] Executing ${side} ${amount} ${symbol} @ ~$${price.toFixed(2)} (${isSandbox ? "sandbox" : "LIVE"})`);

    const order = await exchange.createOrder(symbol, "market", side, amount);

    const filledPrice = order.average || order.price || price;
    const cost = order.cost || amount * filledPrice;

    // Log the trade
    const tradeId = await logTrade({
      symbol,
      side,
      orderType: "market",
      amount,
      price: filledPrice,
      cost,
      orderId: order.id,
      source: "sentinel",
      reasoning: action.reason,
      sentinelRunId,
      sandbox: isSandbox,
    });

    // Position management + P&L tracking
    let realizedPnl = 0;
    if (side === "buy") {
      await openPosition({
        symbol,
        side: "long",
        entryPrice: filledPrice,
        amount,
        costBasis: cost,
        entryTradeId: tradeId,
      });
    } else if (side === "sell") {
      const pos = await getPositionForSymbol(symbol);
      if (pos) {
        realizedPnl = (filledPrice - pos.entryPrice) * amount;
        await closePosition({
          positionId: pos.id,
          exitTradeId: tradeId,
          exitPrice: filledPrice,
          status: "closed",
        });
      }
    }

    // Update daily state with mutex to prevent race condition
    while (dailyStateLock) {
      await new Promise((r) => setTimeout(r, 50));
    }
    dailyStateLock = true;
    try {
      // Re-read daily state under lock to avoid stale data
      const freshState = getDailyState();
      freshState.trades_today += 1;
      freshState.pnl_today += realizedPnl;
      await saveDailyState(freshState);
    } finally {
      dailyStateLock = false;
    }

    console.log(`[Richy:Sentinel] Trade executed: ${side} ${amount} ${symbol} @ $${filledPrice.toFixed(2)}`);
    return `${side.toUpperCase()} ${amount} ${symbol} @ $${filledPrice.toFixed(2)}`;
  } catch (err: any) {
    console.error(`[Richy:Sentinel] Trade failed: ${err.message}`);
    return null;
  }
}

// ─── Step 5: Save run ───────────────────────────────────────────────

async function saveSentinelRun(params: {
  indicators: Record<string, TechnicalIndicators>;
  portfolio: any[];
  parsed: SentinelOutput | null;
  fullText: string;
  durationMs: number;
  error?: string;
}): Promise<string> {
  const id = nanoid();
  await db.insert(schema.sentinelRuns).values({
    id,
    indicators: JSON.stringify(params.indicators),
    portfolio: JSON.stringify(params.portfolio),
    sentiment: params.parsed?.sentiment ? JSON.stringify(params.parsed.sentiment) : null,
    signals: params.parsed?.signals ? JSON.stringify(params.parsed.signals) : null,
    actions: params.parsed?.actions ? JSON.stringify(params.parsed.actions) : null,
    summary: params.parsed?.summary ?? params.fullText.substring(0, 1000),
    durationMs: params.durationMs,
    error: params.error ?? null,
  });
  return id;
}

export interface SentinelRunRow {
  id: string;
  summary: string | null;
  sentiment: string | null;
  signals: string | null;
  actions: string | null;
  indicators: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: Date | null;
}

export async function getRecentSentinelRuns(
  limit: number = 20
): Promise<SentinelRunRow[]> {
  return db
    .select({
      id: schema.sentinelRuns.id,
      summary: schema.sentinelRuns.summary,
      sentiment: schema.sentinelRuns.sentiment,
      signals: schema.sentinelRuns.signals,
      actions: schema.sentinelRuns.actions,
      indicators: schema.sentinelRuns.indicators,
      durationMs: schema.sentinelRuns.durationMs,
      error: schema.sentinelRuns.error,
      createdAt: schema.sentinelRuns.createdAt,
    })
    .from(schema.sentinelRuns)
    .orderBy(desc(schema.sentinelRuns.createdAt))
    .limit(limit)
    .all();
}

export async function getSentinelRun(id: string): Promise<SentinelRunRow | null> {
  const rows = db
    .select({
      id: schema.sentinelRuns.id,
      summary: schema.sentinelRuns.summary,
      sentiment: schema.sentinelRuns.sentiment,
      signals: schema.sentinelRuns.signals,
      actions: schema.sentinelRuns.actions,
      indicators: schema.sentinelRuns.indicators,
      durationMs: schema.sentinelRuns.durationMs,
      error: schema.sentinelRuns.error,
      createdAt: schema.sentinelRuns.createdAt,
    })
    .from(schema.sentinelRuns)
    .where(eq(schema.sentinelRuns.id, id))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

// ─── Notification ───────────────────────────────────────────────────

async function notifyUser(summary: string): Promise<void> {
  const notifyText = `[Crypto Sentinel] ${summary}`;

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
        const truncated =
          notifyText.length > 4000
            ? notifyText.substring(0, 3997) + "..."
            : notifyText;
        await sendTelegramMessage(chats[0].chatId!, truncated);
        return;
      }
    } catch (err: any) {
      console.error(
        "[Richy:Sentinel] Failed to send Telegram notification:",
        err.message
      );
    }
  }

  const rawPhone = getSettingSync("user_phone");
  if (rawPhone) {
    const userPhone = String(rawPhone);
    try {
      const { sendIMessage } = await import("../imessage/applescript");
      const truncated =
        notifyText.length > 1000
          ? notifyText.substring(0, 997) + "..."
          : notifyText;
      await sendIMessage(userPhone, truncated);
    } catch (err: any) {
      console.error(
        "[Richy:Sentinel] Failed to send iMessage notification:",
        err.message
      );
    }
  }
}

// ─── Main tick ──────────────────────────────────────────────────────

async function sentinelTick(): Promise<void> {
  const enabled = getSettingSync("crypto_sentinel_enabled");
  if (enabled !== "on") return;

  if (isRunning) {
    console.log("[Richy:Sentinel] Previous run still in progress, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // Step 1: Gather all context (pre-fetch web data)
    console.log("[Richy:Sentinel] Gathering context + fetching sources...");
    const ctx = await gatherSentinelContext();

    // Context quality check: if portfolio is empty but we expect data, skip
    if (ctx.portfolio.length === 0 && Object.keys(ctx.indicators).length === 0) {
      console.warn("[Richy:Sentinel] Degraded context: no portfolio or indicators available. Skipping analysis.");
      await saveSentinelRun({
        indicators: {},
        portfolio: [],
        parsed: null,
        fullText: "",
        durationMs: Date.now() - startTime,
        error: "Degraded context — no portfolio or indicator data",
      }).catch(() => {});
      return;
    }

    // Step 2: Build prompt (no tool references)
    const { userMessage, systemPrompt } = buildSentinelPrompt(ctx);

    // Step 3: Run AI — no tools, use background model (Ollama)
    console.log("[Richy:Sentinel] Running analysis...");
    const conversationId = await getOrCreateConversation();

    const result = await runAgent({
      conversationId,
      userMessage,
      systemPromptOverride: systemPrompt,
      historyLimit: 0,
      skipMemoryExtraction: true,
      useMainModel: false,
      toolFilter: [],
    });

    const durationMs = Date.now() - startTime;
    console.log(`[Richy:Sentinel] Analysis completed (${(durationMs / 1000).toFixed(1)}s)`);

    // Step 4: Parse output
    const parsed = result.text ? parseSentinelOutput(result.text) : null;

    // Step 5: Save run
    const runId = await saveSentinelRun({
      indicators: ctx.indicators,
      portfolio: ctx.portfolio,
      parsed,
      fullText: result.text || "",
      durationMs,
    });

    // Step 6: Execute trades (if auto-confirm and trading enabled)
    const autoConfirm = getSettingSync("crypto_sentinel_auto_confirm") === "on";
    const tradeResults: string[] = [];

    if (autoConfirm && isTradingEnabled() && parsed?.actions) {
      for (const action of parsed.actions) {
        if (action.type === "buy" || action.type === "sell") {
          const tradeResult = await executeSentinelTrade(action, runId);
          if (tradeResult) tradeResults.push(tradeResult);
        }
      }
    }

    // Step 7: Check CEO escalation
    const ceoEnabled = getSettingSync("crypto_ceo_enabled") === "on";
    const escalationEnabled = getSettingSync("crypto_ceo_escalation_enabled") !== "off";
    if (ceoEnabled && escalationEnabled) {
      const directive = getCEODirective();
      if (directive) {
        const escalation = shouldEscalate(ctx, directive);
        if (escalation.escalate) {
          // Debounce: max 1 CEO call per 4 hours
          const lastRun = getSettingSync("crypto_ceo_last_run_at");
          const hoursSinceLast = lastRun
            ? (Date.now() - new Date(lastRun).getTime()) / 3600000
            : Infinity;
          if (hoursSinceLast >= 4) {
            console.log(`[Richy:Sentinel] CEO escalation triggered: ${escalation.reason}`);
            runCEOBriefing().catch((err) => {
              console.error("[Richy:Sentinel] CEO escalation failed:", err.message);
            });
          } else {
            console.log(`[Richy:Sentinel] CEO escalation needed (${escalation.reason}) but debounced (last run ${hoursSinceLast.toFixed(1)}h ago)`);
          }
        }
      }
    }

    // Notify user
    let notifyMsg = parsed?.summary || result.text || "Analysis complete";
    if (tradeResults.length > 0) {
      notifyMsg += `\n\nTrades executed: ${tradeResults.join(", ")}`;
    }
    await notifyUser(notifyMsg);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error("[Richy:Sentinel] Scan error:", error.message);

    await saveSentinelRun({
      indicators: {},
      portfolio: [],
      parsed: null,
      fullText: "",
      durationMs,
      error: error.message,
    }).catch(() => {});
  } finally {
    isRunning = false;
  }
}

// ─── Start/Stop ─────────────────────────────────────────────────────

export async function startCryptoSentinel(): Promise<void> {
  const enabled = getSettingSync("crypto_sentinel_enabled");
  if (enabled !== "on") {
    console.log("[Richy:Sentinel] Sentinel is disabled. Not starting.");
    return;
  }

  const cryptoKey = getSettingSync("crypto_api_key");
  if (!cryptoKey) {
    console.log(
      "[Richy:Sentinel] No crypto API key configured. Not starting."
    );
    return;
  }

  const intervalMin =
    parseInt(getSettingSync("crypto_sentinel_interval") || "30", 10) || 30;
  const intervalMs = intervalMin * 60 * 1000;

  sentinelInitialTimeout = setTimeout(() => {
    sentinelInitialTimeout = null;
    sentinelTick().catch((err) => {
      console.error("[Richy:Sentinel] Initial tick failed:", err.message);
    });
  }, 10_000);

  sentinelTimer = setInterval(() => {
    sentinelTick().catch((err) => {
      console.error("[Richy:Sentinel] Tick failed:", err.message);
    });
  }, intervalMs);

  console.log(
    `[Richy:Sentinel] Started (every ${intervalMin} minutes)`
  );
}

export function stopCryptoSentinel(): void {
  if (sentinelInitialTimeout) {
    clearTimeout(sentinelInitialTimeout);
    sentinelInitialTimeout = null;
  }
  if (sentinelTimer) {
    clearInterval(sentinelTimer);
    sentinelTimer = null;
    console.log("[Richy:Sentinel] Stopped");
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
