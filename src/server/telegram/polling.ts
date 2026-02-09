import { getBot, destroyBot, isUserAllowed, sendTelegramMessage } from "./bot";
import { runAgent } from "../agent/runner";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getSettingSync } from "../db/settings";

let activeBotHandle: { stop: () => void } | null = null;

/**
 * Get or create a Richy conversation for a Telegram chat.
 */
async function getOrCreateConversation(
  chatId: number,
  username?: string,
  firstName?: string
): Promise<string> {
  const chatIdStr = String(chatId);

  // Check for existing mapping
  const existing = db
    .select()
    .from(schema.telegramState)
    .where(eq(schema.telegramState.chatId, chatIdStr))
    .all();

  if (existing.length > 0 && existing[0].conversationId) {
    const conv = db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, existing[0].conversationId))
      .all();

    if (conv.length > 0) return existing[0].conversationId;
  }

  // Create new conversation
  const convId = nanoid();
  const title = firstName
    ? `Telegram: ${firstName}${username ? ` (@${username})` : ""}`
    : `Telegram: ${chatIdStr}`;

  await db.insert(schema.conversations).values({
    id: convId,
    title,
    metadata: JSON.stringify({
      source: "telegram",
      chatId: chatIdStr,
      username: username || null,
    }),
  });

  // Save mapping
  const stateId = `chat_${chatIdStr}`;
  const existingState = db
    .select()
    .from(schema.telegramState)
    .where(eq(schema.telegramState.id, stateId))
    .all();

  if (existingState.length > 0) {
    await db
      .update(schema.telegramState)
      .set({ conversationId: convId, username: username || null })
      .where(eq(schema.telegramState.id, stateId));
  } else {
    await db.insert(schema.telegramState).values({
      id: stateId,
      chatId: chatIdStr,
      conversationId: convId,
      username: username || null,
    });
  }

  console.log(
    `[Richy:Telegram] Created conversation ${convId} for chat ${chatIdStr}`
  );
  return convId;
}

function loadLastUpdateId(): number {
  try {
    const state = db
      .select()
      .from(schema.telegramState)
      .where(eq(schema.telegramState.id, "singleton"))
      .all();
    return state.length > 0 ? (state[0].lastUpdateId ?? 0) : 0;
  } catch {
    return 0;
  }
}

async function saveLastUpdateId(updateId: number): Promise<void> {
  const existing = db
    .select()
    .from(schema.telegramState)
    .where(eq(schema.telegramState.id, "singleton"))
    .all();

  if (existing.length > 0) {
    await db
      .update(schema.telegramState)
      .set({ lastUpdateId: updateId, updatedAt: new Date() })
      .where(eq(schema.telegramState.id, "singleton"));
  } else {
    await db.insert(schema.telegramState).values({
      id: "singleton",
      lastUpdateId: updateId,
    });
  }
}

// Per-chat sequential processing lock
const MAX_CHAT_LOCKS = 50;
const chatLocks = new Map<number, Promise<void>>();

async function handleMessage(
  chatId: number,
  text: string,
  username?: string,
  firstName?: string
): Promise<void> {
  console.log(
    `[Richy:Telegram] Received from ${username || chatId}: "${text.substring(0, 50)}"`
  );

  const conversationId = await getOrCreateConversation(
    chatId,
    username,
    firstName
  );

  try {
    const result = await runAgent({
      conversationId,
      userMessage: text,
      systemContext:
        "This message arrived via Telegram. Keep responses concise and conversational.",
    });

    if (result.text) {
      await sendTelegramMessage(chatId, result.text);
    }
  } catch (error: any) {
    console.error(`[Richy:Telegram] Agent error:`, error.message);
    try {
      await sendTelegramMessage(
        chatId,
        "Sorry, I ran into an error processing that. Try again in a moment."
      );
    } catch {
      // Can't send error message
    }
  }
}

function enqueueForChat(
  chatId: number,
  text: string,
  username?: string,
  firstName?: string
): void {
  // Queue depth limit — reject new messages if too many chats are queued
  if (chatLocks.size >= MAX_CHAT_LOCKS && !chatLocks.has(chatId)) {
    console.warn(`[Richy:Telegram] Queue depth limit (${MAX_CHAT_LOCKS}) reached, skipping message from chat ${chatId}`);
    return;
  }
  const previous = chatLocks.get(chatId) ?? Promise.resolve();
  const next = previous.then(() =>
    handleMessage(chatId, text, username, firstName).catch((err) => {
      console.error(
        `[Richy:Telegram] Unhandled error for chat ${chatId}:`,
        err.message
      );
    })
  );
  chatLocks.set(chatId, next);
  next.then(() => {
    if (chatLocks.get(chatId) === next) chatLocks.delete(chatId);
  });
}

/**
 * Start the Telegram long-polling loop.
 */
export async function startTelegramPolling(): Promise<void> {
  const mode = getSettingSync("autonomous_mode");
  if (mode !== "on") {
    console.log(
      "[Richy:Telegram] Autonomous mode is off. Polling not started."
    );
    return;
  }

  const token = getSettingSync("telegram_bot_token");
  if (!token) {
    console.log(
      "[Richy:Telegram] No bot token configured. Polling not started."
    );
    return;
  }

  const bot = getBot();
  if (!bot) return;

  const lastUpdateId = loadLastUpdateId();

  // Handle text messages
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;

    if (!isUserAllowed(userId, username)) {
      console.log(
        `[Richy:Telegram] Unauthorized user ${userId} (@${username}). Ignoring.`
      );
      await ctx.reply(
        "Sorry, I'm not configured to chat with you. Ask my owner to add you."
      );
      return;
    }

    await saveLastUpdateId(ctx.update.update_id);
    enqueueForChat(chatId, text, username, firstName);
  });

  // /start command
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;

    if (userId && !isUserAllowed(userId, username)) {
      await ctx.reply("Sorry, I'm not configured to chat with you.");
      return;
    }

    const richyName = getSettingSync("buddy_name") || "Richy";
    await ctx.reply(
      `Hi! I'm ${richyName}, your personal AI assistant. Just send me a message and I'll help you out!`
    );
  });

  bot.catch((err) => {
    console.error("[Richy:Telegram] Bot error:", err.message);
  });

  // Start long polling
  bot.start({
    drop_pending_updates: lastUpdateId === 0,
    allowed_updates: ["message"],
    onStart: (botInfo) => {
      console.log(
        `[Richy:Telegram] Bot @${botInfo.username} polling started`
      );
    },
  });

  activeBotHandle = { stop: () => bot.stop() };
}

/**
 * Stop the Telegram polling loop.
 */
export function stopTelegramPolling(): void {
  if (activeBotHandle) {
    activeBotHandle.stop();
    activeBotHandle = null;
    destroyBot();
    console.log("[Richy:Telegram] Polling stopped");
  }
}
