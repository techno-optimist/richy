import { Bot, GrammyError, HttpError } from "grammy";
import { getSettingSync } from "../db/settings";

let botInstance: Bot | null = null;

/**
 * Get or create the grammy Bot instance.
 * Returns null if no token is configured.
 */
export function getBot(): Bot | null {
  if (botInstance) return botInstance;

  const token = getSettingSync("telegram_bot_token");
  if (!token) return null;

  botInstance = new Bot(token);
  return botInstance;
}

/**
 * Destroy the bot instance (for reconfiguration).
 */
export function destroyBot(): void {
  botInstance = null;
}

/**
 * Check if a Telegram user is allowed to interact with the bot.
 * DEFAULT DENY: if no allowed_users are configured, NO users are allowed.
 */
export function isUserAllowed(userId: number, username?: string): boolean {
  const allowedRaw = getSettingSync("telegram_allowed_users");
  if (!allowedRaw || allowedRaw.trim() === "") {
    console.warn(`[Richy:Telegram] Rejected user ${userId} (${username || "unknown"}) — no telegram_allowed_users configured`);
    return false;
  }

  const allowed = allowedRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.includes(String(userId))) return true;

  if (username) {
    const lower = username.toLowerCase();
    if (allowed.includes(lower) || allowed.includes(`@${lower}`)) return true;
  }

  return false;
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx < maxLen / 2) splitIdx = maxLen;
    chunks.push(remaining.substring(0, splitIdx));
    remaining = remaining.substring(splitIdx).trimStart();
  }
  return chunks;
}

/**
 * Send a Telegram message to a specific chat.
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string
): Promise<void> {
  const bot = getBot();
  if (!bot) throw new Error("Telegram bot not configured (no token).");

  try {
    if (text.length <= 4096) {
      await bot.api.sendMessage(chatId, text);
    } else {
      const chunks = splitMessage(text, 4096);
      for (const chunk of chunks) {
        await bot.api.sendMessage(chatId, chunk);
      }
    }
  } catch (error) {
    if (error instanceof GrammyError) {
      throw new Error(`Telegram API error: ${error.description}`);
    } else if (error instanceof HttpError) {
      throw new Error(`Telegram network error: ${error.message}`);
    }
    throw error;
  }
}
