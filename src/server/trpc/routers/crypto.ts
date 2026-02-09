import { z } from "zod/v4";
import { router, protectedProcedure } from "../init";
import { getRecentSentinelRuns, getSentinelRun } from "../../crypto/sentinel";
import { getRecentTrades, getDailyTradeStats } from "../../crypto/trade-logger";
import { getOpenPositionSummaries } from "../../crypto/positions";
import { getCEODirective, runCEOBriefing } from "../../crypto/ceo";
import { getSettingSync } from "../../db/settings";
import { db, schema } from "../../db";

export const cryptoRouter = router({
  sentinelRuns: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const runs = await getRecentSentinelRuns(input.limit);
      return runs.map((r) => ({
        ...r,
        sentiment: r.sentiment ? safeJsonParse(r.sentiment) : null,
        signals: r.signals ? safeJsonParse(r.signals) : null,
        actions: r.actions ? safeJsonParse(r.actions) : null,
      }));
    }),

  sentinelRun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const run = await getSentinelRun(input.id);
      if (!run) return null;
      return {
        ...run,
        sentiment: run.sentiment ? safeJsonParse(run.sentiment) : null,
        signals: run.signals ? safeJsonParse(run.signals) : null,
        actions: run.actions ? safeJsonParse(run.actions) : null,
        indicators: run.indicators ? safeJsonParse(run.indicators) : null,
      };
    }),

  positions: protectedProcedure.query(async () => {
    return getOpenPositionSummaries();
  }),

  trades: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }))
    .query(async ({ input }) => {
      return getRecentTrades(input.limit);
    }),

  dailyStats: protectedProcedure.query(async () => {
    return getDailyTradeStats();
  }),

  config: protectedProcedure.query(async () => {
    return {
      enabled: getSettingSync("crypto_sentinel_enabled") === "on",
      interval: parseInt(getSettingSync("crypto_sentinel_interval") || "30", 10),
      coins: getSettingSync("crypto_sentinel_coins") || "BTC,ETH",
      autoConfirm: getSettingSync("crypto_sentinel_auto_confirm") === "on",
      tradingEnabled: getSettingSync("crypto_trading_enabled") === "on",
      maxTradesPerDay: parseInt(getSettingSync("crypto_sentinel_max_trades_per_day") || "5", 10),
      dailyLossLimit: parseInt(getSettingSync("crypto_sentinel_daily_loss_limit_usd") || "50", 10),
      sandboxMode: getSettingSync("crypto_sandbox_mode") !== "off",
      maxTradeUsd: parseInt(getSettingSync("crypto_max_trade_usd") || "100", 10),
      stopLossPct: parseInt(getSettingSync("crypto_default_stop_loss_pct") || "5", 10),
      takeProfitPct: parseInt(getSettingSync("crypto_default_take_profit_pct") || "10", 10),
      trailingStop: getSettingSync("crypto_trailing_stop_enabled") === "on",
      trailingStopPct: parseInt(getSettingSync("crypto_trailing_stop_pct") || "3", 10),
      // CEO settings
      ceoEnabled: getSettingSync("crypto_ceo_enabled") === "on",
      ceoBriefingHour: parseInt(getSettingSync("crypto_ceo_briefing_hour") || "6", 10),
      ceoEscalationEnabled: getSettingSync("crypto_ceo_escalation_enabled") !== "off",
    };
  }),

  // ─── CEO Directive ───────────────────────────────────────────
  ceoDirective: protectedProcedure.query(async () => {
    const directive = getCEODirective();
    return directive;
  }),

  triggerCEOBriefing: protectedProcedure.mutation(async () => {
    const result = await runCEOBriefing();
    return result;
  }),

  updateConfig: protectedProcedure
    .input(z.object({ settings: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input }) => {
      // Whitelist: only allow sentinel/trading config keys
      const ALLOWED_KEYS = new Set([
        "crypto_sentinel_enabled",
        "crypto_sentinel_interval",
        "crypto_sentinel_coins",
        "crypto_trading_enabled",
        "crypto_sentinel_auto_confirm",
        "crypto_sentinel_max_trades_per_day",
        "crypto_sentinel_daily_loss_limit_usd",
        "crypto_max_trade_usd",
        "crypto_sandbox_mode",
        "crypto_default_stop_loss_pct",
        "crypto_default_take_profit_pct",
        "crypto_trailing_stop_enabled",
        "crypto_trailing_stop_pct",
        "crypto_ceo_enabled",
        "crypto_ceo_briefing_hour",
        "crypto_ceo_escalation_enabled",
      ]);

      for (const [key, val] of Object.entries(input.settings)) {
        if (!ALLOWED_KEYS.has(key)) {
          console.warn(`[Richy:Config] Rejected update for non-whitelisted key: ${key}`);
          continue;
        }
        const value = typeof val === "string" ? val : String(val);
        await db
          .insert(schema.settings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.settings.key,
            set: { value, updatedAt: new Date() },
          });
      }
      return { success: true };
    }),
});

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
