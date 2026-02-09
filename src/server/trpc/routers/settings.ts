import { z } from "zod/v4";
import { router, publicProcedure, protectedProcedure, validateAuthToken } from "../init";
import { schema } from "../../db";
import { eq } from "drizzle-orm";

// Keys that should never be returned in bulk queries
const SENSITIVE_KEYS = new Set([
  "ai_api_key",
  "crypto_api_key",
  "crypto_api_secret",
  "crypto_passphrase",
  "telegram_bot_token",
  "firecrawl_api_key",
  "crypto_panic_api_key",
  "richy_auth_token",
]);

export const settingsRouter = router({
  // Public endpoint — validates a token without requiring prior authentication.
  // Returns { valid: true/false } only; leaks no data.
  checkToken: publicProcedure.query(({ ctx }) => {
    return { valid: validateAuthToken(ctx.authToken) };
  }),

  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      // Never return the auth token via API
      if (input.key === "richy_auth_token") return null;
      const result = await ctx.db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, input.key))
        .limit(1);
      if (result.length === 0) return null;
      try {
        return JSON.parse(result[0].value);
      } catch {
        return result[0].value;
      }
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const results = await ctx.db.select().from(schema.settings);
    const record: Record<string, unknown> = {};
    for (const row of results) {
      if (row.key === "richy_auth_token") continue; // Never expose auth token
      if (SENSITIVE_KEYS.has(row.key)) {
        // Return masked indicator — UI can show "configured" state
        record[row.key] = row.value && row.value.length > 0 ? "••••••••" : "";
        continue;
      }
      try {
        record[row.key] = JSON.parse(row.value);
      } catch {
        record[row.key] = row.value;
      }
    }
    return record;
  }),

  // Get a single sensitive setting (for password eye-toggle in settings UI)
  getSecret: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!SENSITIVE_KEYS.has(input.key)) {
        return null; // Only allows fetching known sensitive keys
      }
      if (input.key === "richy_auth_token") return null;
      const result = await ctx.db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, input.key))
        .limit(1);
      if (result.length === 0) return null;
      try {
        return JSON.parse(result[0].value);
      } catch {
        return result[0].value;
      }
    }),

  set: protectedProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent setting auth token via API
      if (input.key === "richy_auth_token") {
        return { success: false };
      }
      const value =
        typeof input.value === "string"
          ? input.value
          : JSON.stringify(input.value);
      await ctx.db
        .insert(schema.settings)
        .values({ key: input.key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value, updatedAt: new Date() },
        });
      return { success: true };
    }),

  setBatch: protectedProcedure
    .input(z.object({ settings: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      for (const [key, val] of Object.entries(input.settings)) {
        // Prevent setting auth token via API
        if (key === "richy_auth_token") continue;
        const value = typeof val === "string" ? val : JSON.stringify(val);
        await ctx.db
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
