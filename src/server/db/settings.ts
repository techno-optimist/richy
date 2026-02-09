import { db, schema } from "./index";
import { eq } from "drizzle-orm";

/**
 * Synchronously read a setting value from the database.
 * Returns null if the key doesn't exist or on error.
 */
export function getSettingSync(key: string): string | null {
  try {
    const result = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1)
      .all();
    if (result.length === 0) return null;
    try {
      return JSON.parse(result[0].value);
    } catch {
      return result[0].value;
    }
  } catch {
    return null;
  }
}
