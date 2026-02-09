import { initTRPC, TRPCError } from "@trpc/server";
import { db, schema } from "../db";
import superjson from "superjson";
import crypto from "crypto";

// ─── Auth token management ─────────────────────────────────────────
const AUTH_TOKEN_KEY = "richy_auth_token";

function getOrCreateAuthToken(): string {
  const existing = db
    .select()
    .from(schema.settings)
    .where(
      require("drizzle-orm").eq(schema.settings.key, AUTH_TOKEN_KEY)
    )
    .get();

  if (existing?.value) {
    try {
      return JSON.parse(existing.value);
    } catch {
      return existing.value;
    }
  }

  // Generate new token on first run
  const token = crypto.randomBytes(32).toString("hex");
  db.insert(schema.settings)
    .values({ key: AUTH_TOKEN_KEY, value: token, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: token, updatedAt: new Date() },
    })
    .run();

  console.log("\n" + "=".repeat(60));
  console.log("[Richy:Auth] Dashboard auth token generated:");
  console.log(`  ${token}`);
  console.log("=".repeat(60) + "\n");

  return token;
}

let cachedToken: string | null = null;

export function getAuthToken(): string {
  if (!cachedToken) {
    cachedToken = getOrCreateAuthToken();
  }
  return cachedToken;
}

export function validateAuthToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return token === getAuthToken();
}

// ─── Rate limiting ─────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

// ─── tRPC setup ────────────────────────────────────────────────────
export const createTRPCContext = async (opts?: { headers?: Headers }) => {
  const authHeader = opts?.headers?.get("x-auth-token") || null;
  return { db, authToken: authHeader };
};

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
  });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// Protected procedure — requires valid auth token
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!validateAuthToken(ctx.authToken)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing auth token",
    });
  }
  return next({ ctx });
});
