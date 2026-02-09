import { db, schema } from "../db";
import { desc, sql } from "drizzle-orm";
import { runAgent } from "../agent/runner";
import { nanoid } from "nanoid";
import { getSettingSync } from "../db/settings";
import { gatherSentinelContext, type SentinelContext } from "./sentinel";
import { getRecentSentinelRuns } from "./sentinel";
import { getDailyTradeStats, getRecentTrades } from "./trade-logger";
import { getMaxTradeUsd } from "./client";
import { getDailyState } from "./daily-state";

// ─── Types ──────────────────────────────────────────────────────────

export interface CEODirective {
  generatedAt: string;
  validUntil: string;
  modelUsed: string;
  marketRegime: "risk-on" | "risk-off" | "neutral" | "volatile";
  overallBias: "bullish" | "bearish" | "neutral";
  riskLevel: number;
  coins: Record<
    string,
    {
      bias: "bullish" | "bearish" | "neutral";
      action: string;
      maxPositionPct: number;
      notes: string;
    }
  >;
  keyLevels: Record<
    string,
    {
      buyZone: [number, number];
      sellZone: [number, number];
    }
  >;
  riskGuidelines: string;
  avoid: string[];
  escalationTriggers: string[];
  summary: string;
}

interface CEOContext extends SentinelContext {
  recentRuns24h: {
    summary: string | null;
    actions: string | null;
    createdAt: Date | null;
  }[];
  currentDirective: CEODirective | null;
  directivePerformance: {
    tradesSince: number;
    pnlSince: number;
  };
}

// ─── Settings key ───────────────────────────────────────────────────

const CEO_DIRECTIVE_KEY = "crypto_ceo_directive";
const CEO_LAST_RUN_KEY = "crypto_ceo_last_run_at";

// ─── Read / Write directive ─────────────────────────────────────────

export function getCEODirective(): CEODirective | null {
  const raw = getSettingSync(CEO_DIRECTIVE_KEY);
  if (!raw) return null;
  try {
    // raw is already a string after getSettingSync JSON.parse
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && parsed.generatedAt) return parsed as CEODirective;
    return null;
  } catch {
    return null;
  }
}

async function saveCEODirective(directive: CEODirective): Promise<void> {
  // Double-stringify pattern: getSettingSync does JSON.parse on read,
  // so we need the stored value to survive that parse
  const serialized = JSON.stringify(JSON.stringify(directive));
  await db
    .insert(schema.settings)
    .values({ key: CEO_DIRECTIVE_KEY, value: serialized, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: serialized, updatedAt: new Date() },
    });

  // Also save last run timestamp
  const tsValue = JSON.stringify(new Date().toISOString());
  await db
    .insert(schema.settings)
    .values({ key: CEO_LAST_RUN_KEY, value: tsValue, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: tsValue, updatedAt: new Date() },
    });
}

// ─── Gather enriched context ────────────────────────────────────────

async function gatherCEOContext(): Promise<CEOContext> {
  // Reuse sentinel's context gathering (portfolio, TA, positions, etc.)
  const baseCtx = await gatherSentinelContext();

  // Enrich: last 24h of sentinel runs (not just 3)
  const twentyFourHoursAgo = Math.floor((Date.now() - 86400000) / 1000);
  const recentRuns24h = db
    .select({
      summary: schema.sentinelRuns.summary,
      actions: schema.sentinelRuns.actions,
      createdAt: schema.sentinelRuns.createdAt,
    })
    .from(schema.sentinelRuns)
    .where(sql`${schema.sentinelRuns.createdAt} >= ${twentyFourHoursAgo}`)
    .orderBy(desc(schema.sentinelRuns.createdAt))
    .all();

  // Current directive (for self-review)
  const currentDirective = getCEODirective();

  // Performance since directive was set
  let directivePerformance = { tradesSince: 0, pnlSince: 0 };
  if (currentDirective) {
    const directiveEpoch = Math.floor(
      new Date(currentDirective.generatedAt).getTime() / 1000
    );
    const tradesSince = db
      .select()
      .from(schema.tradeHistory)
      .where(sql`${schema.tradeHistory.createdAt} >= ${directiveEpoch}`)
      .all();

    const closedSince = db
      .select()
      .from(schema.openPositions)
      .where(
        sql`${schema.openPositions.closedAt} >= ${directiveEpoch} AND ${schema.openPositions.status} != 'open'`
      )
      .all();

    let pnlSince = 0;
    for (const p of closedSince) {
      pnlSince += p.realizedPnl ?? 0;
    }

    directivePerformance = {
      tradesSince: tradesSince.length,
      pnlSince,
    };
  }

  return {
    ...baseCtx,
    recentRuns24h,
    currentDirective,
    directivePerformance,
  };
}

// ─── Build prompt (compact, token-optimized) ────────────────────────

function buildCEOPrompt(ctx: CEOContext): {
  userMessage: string;
  systemPrompt: string;
} {
  const coins = ctx.coinList;
  const dailyState = getDailyState();
  const maxTrades = parseInt(
    getSettingSync("crypto_sentinel_max_trades_per_day") || "5",
    10
  );
  const lossLimit = parseInt(
    getSettingSync("crypto_sentinel_daily_loss_limit_usd") || "50",
    10
  );

  // ─── Portfolio (compact table) ──────────────────────────────
  let portfolioSection = "## Portfolio\n";
  if (ctx.portfolio.length === 0) {
    portfolioSection += "No holdings.\n";
  } else {
    portfolioSection += "| Asset | Amount | Free |\n|---|---|---|\n";
    for (const h of ctx.portfolio) {
      portfolioSection += `| ${h.currency} | ${h.amount} | ${h.free} |\n`;
    }
  }

  // ─── Positions (compact table) ──────────────────────────────
  let positionsSection = "## Open Positions\n";
  if (ctx.positions.length === 0) {
    positionsSection += "None.\n";
  } else {
    positionsSection +=
      "| Symbol | Side | Entry | Current | P&L | SL | TP |\n|---|---|---|---|---|---|---|\n";
    for (const p of ctx.positions) {
      const pnl = p.unrealizedPnl
        ? `${p.unrealizedPnl >= 0 ? "+" : ""}$${p.unrealizedPnl.toFixed(2)}`
        : "n/a";
      positionsSection += `| ${p.symbol} | ${p.side} | $${p.entryPrice} | $${p.currentPrice || "?"} | ${pnl} | $${p.stopLoss || "none"} | $${p.takeProfit || "none"} |\n`;
    }
  }

  // ─── Technical Summary (compact table) ──────────────────────
  let taSection = "## Technical Summary\n";
  const taEntries = Object.entries(ctx.indicators);
  if (taEntries.length > 0) {
    taSection +=
      "| Coin | Price | RSI | MACD Hist | Trend | Support | Resistance |\n|---|---|---|---|---|---|---|\n";
    for (const [symbol, ta] of taEntries) {
      const coin = symbol.split("/")[0];
      taSection += `| ${coin} | $${ta.price?.toFixed(2) || "?"} | ${ta.rsi14?.toFixed(1) || "?"} | ${ta.macd?.histogram?.toFixed(2) || "?"} | ${ta.trend || "?"} | $${ta.support?.toFixed(0) || "?"} | $${ta.resistance?.toFixed(0) || "?"} |\n`;
    }
    // Add signal summaries
    for (const [symbol, ta] of taEntries) {
      if (ta.signals && ta.signals.length > 0) {
        taSection += `${symbol.split("/")[0]} signals: ${ta.signals.join(", ")}\n`;
      }
    }
  } else {
    taSection += "No TA data available.\n";
  }

  // ─── Market Headlines (titles only) ─────────────────────────
  let headlinesSection = "## Market Headlines\n";
  const allHeadlines: string[] = [];

  // Firecrawl
  for (const w of ctx.webResults.slice(0, 5)) {
    if (w.title) allHeadlines.push(`[web] ${w.title}`);
  }
  // Reddit
  for (const r of ctx.reddit.slice(0, 5)) {
    allHeadlines.push(`[r/${r.subreddit}] ${r.title} (score: ${r.score})`);
  }
  // CryptoPanic
  for (const n of ctx.news.slice(0, 5)) {
    const votes = `+${n.votesPositive || 0}/-${n.votesNegative || 0}`;
    allHeadlines.push(`[${n.source || "news"}] ${n.title} ${votes}`);
  }

  if (allHeadlines.length === 0) {
    headlinesSection += "No headlines available.\n";
  } else {
    headlinesSection += allHeadlines.slice(0, 12).join("\n") + "\n";
  }

  // ─── Sentinel Performance (24h) ─────────────────────────────
  let perfSection = "## Sentinel Performance (24h)\n";
  const runCount = ctx.recentRuns24h.length;
  let actionsTaken: string[] = [];
  for (const run of ctx.recentRuns24h.slice(0, 5)) {
    if (run.actions) {
      try {
        const acts = JSON.parse(run.actions);
        for (const a of acts) {
          if (a.type !== "hold") {
            actionsTaken.push(`${a.type} ${a.symbol}`);
          }
        }
      } catch {}
    }
  }

  const dailyStats = ctx.dailyStats;
  perfSection += `Runs: ${runCount} | Trades today: ${dailyStats.tradesCount} | P&L: $${dailyStats.realizedPnl.toFixed(2)} | W/L: ${dailyStats.winners}/${dailyStats.losers}\n`;
  if (actionsTaken.length > 0) {
    perfSection += `Recent actions: ${actionsTaken.slice(0, 8).join(", ")}\n`;
  }
  // Last sentinel summary
  if (ctx.recentRuns24h[0]?.summary) {
    const lastSummary = ctx.recentRuns24h[0].summary;
    perfSection += `Last analysis: "${lastSummary.length > 200 ? lastSummary.substring(0, 200) + "..." : lastSummary}"\n`;
  }

  // ─── Current Directive (for self-review) ────────────────────
  let directiveSection = "## Current Directive\n";
  if (ctx.currentDirective) {
    const d = ctx.currentDirective;
    const expired = new Date(d.validUntil) < new Date();
    directiveSection += expired ? "(EXPIRED)\n" : "";
    directiveSection += `Regime: ${d.marketRegime} | Bias: ${d.overallBias} | Risk: ${d.riskLevel}/10\n`;
    directiveSection += `Set: ${d.generatedAt}\n`;
    directiveSection += `Summary: ${d.summary}\n`;
  } else {
    directiveSection += "None (first briefing).\n";
  }

  // ─── Directive Compliance ───────────────────────────────────
  let complianceSection = "## Directive Compliance\n";
  if (ctx.currentDirective) {
    const perf = ctx.directivePerformance;
    complianceSection += `Trades since directive: ${perf.tradesSince} | P&L: $${perf.pnlSince.toFixed(2)}\n`;
  } else {
    complianceSection += "No prior directive to evaluate.\n";
  }

  // ─── Risk Limits ────────────────────────────────────────────
  const risksSection =
    `## Risk Limits\n` +
    `Max trade: $${getMaxTradeUsd()} | Daily loss limit: $${lossLimit} | ` +
    `Trades today: ${dailyState.trades_today}/${maxTrades} | ` +
    `P&L today: $${dailyState.pnl_today.toFixed(2)}\n`;

  // ─── Required Output ───────────────────────────────────────
  const outputFormat =
    `## Required Output\n` +
    `End your response with a \`\`\`ceo-directive JSON block containing:\n` +
    `{\n` +
    `  "marketRegime": "risk-on" | "risk-off" | "neutral" | "volatile",\n` +
    `  "overallBias": "bullish" | "bearish" | "neutral",\n` +
    `  "riskLevel": 1-10,\n` +
    `  "coins": { "BTC": { "bias": "bullish", "action": "accumulate below $X", "maxPositionPct": 40, "notes": "..." }, ... },\n` +
    `  "keyLevels": { "BTC/USD": { "buyZone": [low, high], "sellZone": [low, high] }, ... },\n` +
    `  "riskGuidelines": "free-text risk rules for the Sentinel to follow",\n` +
    `  "avoid": ["DOGE", ...],\n` +
    `  "escalationTriggers": ["BTC drops below $X", ...],\n` +
    `  "summary": "One-paragraph strategic summary"\n` +
    `}\n`;

  // ─── Assemble ──────────────────────────────────────────────
  const userMessage =
    `Generate a strategic directive for the next 24 hours.\nCoins to cover: ${coins.join(", ")}\n\n` +
    portfolioSection +
    "\n" +
    positionsSection +
    "\n" +
    taSection +
    "\n" +
    headlinesSection +
    "\n" +
    perfSection +
    "\n" +
    directiveSection +
    "\n" +
    complianceSection +
    "\n" +
    risksSection +
    "\n" +
    outputFormat;

  const modelName =
    getSettingSync("ai_model") || "claude-sonnet-4-20250514";

  const systemPrompt =
    `You are the Chief Investment Officer for an autonomous crypto trading system called Richy.\n` +
    `Current time: ${new Date().toISOString()}\n\n` +
    `Your employee is the "Sentinel" — a local AI model that runs every 30 minutes to make tactical trading decisions. ` +
    `It is good at following instructions but cannot reason strategically. Your job:\n` +
    `1. Review the market data, technical indicators, and sentiment\n` +
    `2. Assess the Sentinel's recent performance\n` +
    `3. Issue a structured directive that guides the next 24 hours of trading\n\n` +
    `Be specific. Use exact price levels. The Sentinel will follow your guidance literally.\n` +
    `Your directive replaces the previous one entirely.\n\n` +
    `CRITICAL: End your response with a \`\`\`ceo-directive JSON block. Without it, the directive cannot be parsed.`;

  return { userMessage, systemPrompt };
}

// ─── Parse directive from Claude's response ─────────────────────────

function parseCEODirective(
  text: string
): CEODirective | null {
  // Try fenced block first
  const blockMatch = text.match(/```ceo-directive\s*\n([\s\S]*?)\n```/);
  if (blockMatch) {
    try {
      const raw = JSON.parse(blockMatch[1].trim());
      return finalizeParsed(raw);
    } catch {}
  }

  // Fallback: look for JSON block with "marketRegime" key
  const jsonMatch = text.match(
    /\{[\s\S]*"marketRegime"\s*:\s*"[\s\S]*"\s*\}\s*$/
  );
  if (jsonMatch) {
    try {
      const raw = JSON.parse(jsonMatch[0]);
      return finalizeParsed(raw);
    } catch {}
  }

  // Last resort: try to find any large JSON object near the end
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace !== -1) {
    const candidate = text.substring(lastBrace);
    try {
      const raw = JSON.parse(candidate);
      if (raw.marketRegime || raw.overallBias || raw.coins) {
        return finalizeParsed(raw);
      }
    } catch {}
  }

  return null;
}

function finalizeParsed(raw: any): CEODirective {
  const modelName =
    getSettingSync("ai_model") || "claude-sonnet-4-20250514";

  return {
    generatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    modelUsed: modelName,
    marketRegime: raw.marketRegime || "neutral",
    overallBias: raw.overallBias || "neutral",
    riskLevel: raw.riskLevel ?? 5,
    coins: raw.coins || {},
    keyLevels: raw.keyLevels || {},
    riskGuidelines: raw.riskGuidelines || "",
    avoid: raw.avoid || [],
    escalationTriggers: raw.escalationTriggers || [],
    summary: raw.summary || "",
  };
}

// ─── Run CEO Briefing ───────────────────────────────────────────────

let ceoConversationId: string | null = null;
let isCEORunning = false;

async function getOrCreateCEOConversation(): Promise<string> {
  if (ceoConversationId) return ceoConversationId;

  const existing = db
    .select()
    .from(schema.conversations)
    .all()
    .filter((c) => {
      if (!c.metadata) return false;
      try {
        const meta = JSON.parse(c.metadata);
        return meta.source === "ceo-briefing";
      } catch {
        return false;
      }
    });

  if (existing.length > 0) {
    ceoConversationId = existing[0].id;
    return ceoConversationId;
  }

  const id = nanoid();
  await db.insert(schema.conversations).values({
    id,
    title: "CEO Strategic Briefing",
    metadata: JSON.stringify({ source: "ceo-briefing" }),
  });

  ceoConversationId = id;
  console.log(`[Richy:CEO] Created CEO conversation: ${id}`);
  return id;
}

export async function runCEOBriefing(): Promise<{
  success: boolean;
  directive: CEODirective | null;
  error?: string;
}> {
  if (isCEORunning) {
    return { success: false, directive: null, error: "CEO briefing already in progress" };
  }

  isCEORunning = true;
  const startTime = Date.now();

  try {
    console.log("[Richy:CEO] Starting CEO briefing...");

    // Check for API key
    const apiKey = getSettingSync("ai_api_key");
    if (!apiKey) {
      throw new Error("No AI API key configured. Cannot run CEO briefing.");
    }

    // Gather enriched context
    console.log("[Richy:CEO] Gathering context...");
    const ctx = await gatherCEOContext();

    // Build prompt
    const { userMessage, systemPrompt } = buildCEOPrompt(ctx);

    // Call Claude (main model)
    console.log("[Richy:CEO] Calling Claude for strategic analysis...");
    const conversationId = await getOrCreateCEOConversation();

    const result = await runAgent({
      conversationId,
      userMessage,
      systemPromptOverride: systemPrompt,
      historyLimit: 0,
      skipMemoryExtraction: true,
      useMainModel: true,
      toolFilter: [], // No tools — pure analysis
    });

    const durationMs = Date.now() - startTime;
    console.log(
      `[Richy:CEO] Analysis completed (${(durationMs / 1000).toFixed(1)}s)`
    );

    // Parse directive
    const directive = result.text ? parseCEODirective(result.text) : null;

    if (directive) {
      await saveCEODirective(directive);
      console.log(
        `[Richy:CEO] Directive saved: ${directive.marketRegime} / ${directive.overallBias} / risk ${directive.riskLevel}/10`
      );

      // Notify user
      await notifyCEO(
        `CEO Briefing complete. Regime: ${directive.marketRegime}, Bias: ${directive.overallBias}, Risk: ${directive.riskLevel}/10. ${directive.summary}`
      );

      return { success: true, directive };
    } else {
      console.error("[Richy:CEO] Failed to parse directive from response");
      console.error(
        "[Richy:CEO] Raw response (first 500 chars):",
        result.text?.substring(0, 500)
      );
      return {
        success: false,
        directive: null,
        error: "Failed to parse directive from Claude's response",
      };
    }
  } catch (error: any) {
    console.error("[Richy:CEO] Briefing failed:", error.message);
    return { success: false, directive: null, error: error.message };
  } finally {
    isCEORunning = false;
  }
}

// ─── Escalation check ───────────────────────────────────────────────

export function shouldEscalate(
  ctx: SentinelContext,
  directive: CEODirective
): { escalate: boolean; reason: string } {
  // 1. Directive expired
  if (new Date(directive.validUntil) < new Date()) {
    return { escalate: true, reason: "Directive expired" };
  }

  // 2. Major price move against directive
  for (const [symbol, ta] of Object.entries(ctx.indicators)) {
    const coin = symbol.split("/")[0];
    const coinDirective = directive.coins[coin];
    if (!coinDirective || !ta.price) continue;

    // Check key levels — if price has broken far outside expected ranges
    const levels = directive.keyLevels[symbol];
    if (levels) {
      const buyLow = levels.buyZone[0];
      const sellHigh = levels.sellZone[1];
      // Price crashed well below buy zone (>10% below bottom of buy zone)
      if (ta.price < buyLow * 0.9) {
        return {
          escalate: true,
          reason: `${coin} at $${ta.price.toFixed(0)} — crashed >10% below buy zone ($${buyLow})`,
        };
      }
      // Price surged well above sell zone (>10% above top of sell zone)
      if (ta.price > sellHigh * 1.1) {
        return {
          escalate: true,
          reason: `${coin} at $${ta.price.toFixed(0)} — surged >10% above sell zone ($${sellHigh})`,
        };
      }
    }
  }

  // 3. Daily P&L breached 50% of loss limit
  const dailyState = getDailyState();
  const lossLimit = parseInt(
    getSettingSync("crypto_sentinel_daily_loss_limit_usd") || "50",
    10
  );
  if (dailyState.pnl_today <= -(lossLimit * 0.5)) {
    return {
      escalate: true,
      reason: `Daily P&L at $${dailyState.pnl_today.toFixed(2)} — breached 50% of loss limit`,
    };
  }

  return { escalate: false, reason: "" };
}

// ─── Notification ───────────────────────────────────────────────────

async function notifyCEO(message: string): Promise<void> {
  const notifyText = `[CEO] ${message}`;

  // Telegram
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
          const truncated =
            notifyText.length > 4000
              ? notifyText.substring(0, 3997) + "..."
              : notifyText;
          await sendTelegramMessage(chats[0].chatId!, truncated);
        }
      } catch (err: any) {
        console.error("[Richy:CEO] Telegram notify failed:", err.message);
      }
    }
  }

  // iMessage
  if (getSettingSync("notify_imessage") === "on") {
    const rawPhone = getSettingSync("user_phone");
    if (rawPhone) {
      try {
        const { sendIMessage } = await import("../imessage/applescript");
        const truncated =
          notifyText.length > 1000
            ? notifyText.substring(0, 997) + "..."
            : notifyText;
        await sendIMessage(String(rawPhone), truncated);
      } catch (err: any) {
        console.error("[Richy:CEO] iMessage notify failed:", err.message);
      }
    }
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────

let ceoTimer: ReturnType<typeof setInterval> | null = null;
let lastCEORunDate: string | null = null;

function shouldRunBriefing(): boolean {
  const enabled = getSettingSync("crypto_ceo_enabled");
  if (enabled !== "on") return false;

  const apiKey = getSettingSync("ai_api_key");
  if (!apiKey) return false;

  const cryptoKey = getSettingSync("crypto_api_key");
  if (!cryptoKey) return false;

  // Check if already ran today
  const today = new Date().toISOString().slice(0, 10);
  if (lastCEORunDate === today) return false;

  // Check the stored last run date too
  const storedLastRun = getSettingSync(CEO_LAST_RUN_KEY);
  if (storedLastRun) {
    const storedDate = new Date(storedLastRun).toISOString().slice(0, 10);
    if (storedDate === today) {
      lastCEORunDate = today;
      return false;
    }
  }

  // Check if current hour matches configured briefing hour
  const briefingHour = parseInt(
    getSettingSync("crypto_ceo_briefing_hour") || "6",
    10
  );
  const currentHour = new Date().getHours();
  return currentHour >= briefingHour;
}

async function ceoSchedulerTick(): Promise<void> {
  if (!shouldRunBriefing()) return;

  console.log("[Richy:CEO] Scheduled briefing triggered");
  const result = await runCEOBriefing();
  if (result.success) {
    lastCEORunDate = new Date().toISOString().slice(0, 10);
  }
}

export async function startCEOScheduler(): Promise<void> {
  const enabled = getSettingSync("crypto_ceo_enabled");
  if (enabled !== "on") {
    console.log("[Richy:CEO] CEO system disabled. Not starting scheduler.");
    return;
  }

  const briefingHour = parseInt(
    getSettingSync("crypto_ceo_briefing_hour") || "6",
    10
  );

  // Check hourly if it's time to run
  ceoTimer = setInterval(() => {
    ceoSchedulerTick().catch((err) => {
      console.error("[Richy:CEO] Scheduler tick failed:", err.message);
    });
  }, 60 * 60 * 1000); // Check every hour

  console.log(
    `[Richy:CEO] Scheduler started (daily briefing at ${briefingHour}:00)`
  );

  // Do an initial check after 30 seconds
  setTimeout(() => {
    ceoSchedulerTick().catch((err) => {
      console.error("[Richy:CEO] Initial check failed:", err.message);
    });
  }, 30_000);
}

export function stopCEOScheduler(): void {
  if (ceoTimer) {
    clearInterval(ceoTimer);
    ceoTimer = null;
    console.log("[Richy:CEO] Scheduler stopped");
  }
}

// ─── Format directive for Sentinel prompt injection ─────────────────

export function formatDirectiveForSentinel(
  directive: CEODirective
): string {
  const expired = new Date(directive.validUntil) < new Date();
  const ageMs = Date.now() - new Date(directive.generatedAt).getTime();
  const ageHours = Math.floor(ageMs / 3600000);
  const ageStr =
    ageHours < 1
      ? "less than 1 hour ago"
      : ageHours === 1
        ? "1 hour ago"
        : `${ageHours} hours ago`;

  let section = `\n## CEO Strategic Directive${expired ? " (EXPIRED — use extra caution)" : ""}\n`;
  section += `Market Regime: ${directive.marketRegime.toUpperCase()} | Bias: ${directive.overallBias.toUpperCase()} | Risk: ${directive.riskLevel}/10\n`;
  section += `Issued: ${ageStr}\n`;

  // Coin guidance
  const coinEntries = Object.entries(directive.coins);
  if (coinEntries.length > 0) {
    section += "\n### Coin Guidance\n";
    for (const [coin, g] of coinEntries) {
      section += `- **${coin}**: ${g.bias.toUpperCase()} — ${g.action} (max ${g.maxPositionPct}% portfolio)\n`;
      if (g.notes) section += `  ${g.notes}\n`;
    }
  }

  // Key levels
  const levelEntries = Object.entries(directive.keyLevels);
  if (levelEntries.length > 0) {
    section += "\n### Key Levels\n";
    for (const [sym, levels] of levelEntries) {
      section += `- ${sym}: Buy zone $${levels.buyZone[0].toLocaleString()}-$${levels.buyZone[1].toLocaleString()}, Sell zone $${levels.sellZone[0].toLocaleString()}-$${levels.sellZone[1].toLocaleString()}\n`;
    }
  }

  // Risk guidelines
  if (directive.riskGuidelines) {
    section += `\n### Risk Rules\n${directive.riskGuidelines}\n`;
  }

  // Avoid list
  if (directive.avoid.length > 0) {
    section += `Avoid: ${directive.avoid.join(", ")}\n`;
  }

  // Summary
  section += `\n### CEO Summary\n${directive.summary}\n`;

  // Instructions for Sentinel
  section +=
    `\n**IMPORTANT**: Follow the CEO directive for strategic decisions. You may deviate ONLY if:\n` +
    `1. A coin has moved >5% against the directive since it was issued\n` +
    `2. Breaking news fundamentally changes the outlook\n` +
    `If you deviate, explain why in your summary.\n`;

  return section;
}
