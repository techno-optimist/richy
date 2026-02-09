import { db, schema } from "./index";
import { sql } from "drizzle-orm";

/**
 * Clean up old records to prevent unbounded table growth.
 * Called on startup from instrumentation.ts.
 */
export function cleanupOldRecords(): void {
  try {
    const now = Date.now();

    // Delete sentinel_runs older than 90 days
    const ninetyDaysAgo = Math.floor((now - 90 * 24 * 60 * 60 * 1000) / 1000);
    const sentinelResult = db
      .delete(schema.sentinelRuns)
      .where(sql`${schema.sentinelRuns.createdAt} < ${ninetyDaysAgo}`)
      .run();
    if (sentinelResult.changes > 0) {
      console.log(
        `[Richy:Cleanup] Deleted ${sentinelResult.changes} sentinel runs older than 90 days`
      );
    }

    // Delete messages older than 180 days
    const oneEightyDaysAgo = Math.floor(
      (now - 180 * 24 * 60 * 60 * 1000) / 1000
    );
    const messagesResult = db
      .delete(schema.messages)
      .where(sql`${schema.messages.createdAt} < ${oneEightyDaysAgo}`)
      .run();
    if (messagesResult.changes > 0) {
      console.log(
        `[Richy:Cleanup] Deleted ${messagesResult.changes} messages older than 180 days`
      );
    }

    // Delete trade_history older than 365 days
    const yearAgo = Math.floor((now - 365 * 24 * 60 * 60 * 1000) / 1000);
    const tradesResult = db
      .delete(schema.tradeHistory)
      .where(sql`${schema.tradeHistory.createdAt} < ${yearAgo}`)
      .run();
    if (tradesResult.changes > 0) {
      console.log(
        `[Richy:Cleanup] Deleted ${tradesResult.changes} trade history entries older than 1 year`
      );
    }
  } catch (err: any) {
    console.error("[Richy:Cleanup] Failed to clean up old records:", err.message);
  }
}
