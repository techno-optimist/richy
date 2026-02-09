import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { getSettingSync } from "../db/settings";

export interface DailyState {
  trades_today: number;
  pnl_today: number;
  last_reset_date: string;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyState(): DailyState {
  const raw = getSettingSync("crypto_sentinel_state");
  const today = getTodayDate();

  if (raw) {
    try {
      const state = JSON.parse(raw) as DailyState;
      if (state.last_reset_date === today) {
        return state;
      }
    } catch {}
  }

  // New day or no state — return fresh
  return { trades_today: 0, pnl_today: 0, last_reset_date: today };
}

// Exported for use by crypto_trade tool to increment trades_today/pnl_today
export async function saveDailyState(state: DailyState): Promise<void> {
  // Double-stringify: getSettingSync() does JSON.parse on read, so we need
  // the outer layer to survive that parse and return a string that
  // getDailyState() can JSON.parse into the actual object.
  const serialized = JSON.stringify(JSON.stringify(state));
  try {
    await db
      .insert(schema.settings)
      .values({
        key: "crypto_sentinel_state",
        value: serialized,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: serialized, updatedAt: new Date() },
      });
  } catch (err: any) {
    console.error("[Richy:Sentinel] Failed to save daily state:", err.message);
  }
}
