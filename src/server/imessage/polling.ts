import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { getNewMessages, getLatestRowId, sendIMessage, isEchoMessage } from "./applescript";
import { runAgent } from "../agent/runner";
import { nanoid } from "nanoid";
import { getSettingSync } from "../db/settings";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSeenRowId = "0";
let imessageConversationId: string | null = null;

// Message queue + processing lock
const MAX_QUEUE_SIZE = 50;
const messageQueue: string[] = [];
let processing = false;
let errorBackoffMs = 0;
let lastLoggedError = "";
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 2;

/**
 * Load or create the iMessage conversation.
 */
async function getOrCreateConversation(): Promise<string> {
  if (imessageConversationId) return imessageConversationId;

  // Check imessage_state table
  try {
    const state = db
      .select()
      .from(schema.imessageState)
      .where(eq(schema.imessageState.id, "singleton"))
      .all();

    if (state.length > 0 && state[0].conversationId) {
      // Verify the conversation still exists
      const conv = db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, state[0].conversationId))
        .all();

      if (conv.length > 0) {
        imessageConversationId = state[0].conversationId;
        return imessageConversationId;
      }
    }
  } catch {
    // Table might not exist yet
  }

  // Create a new conversation for iMessage
  const id = nanoid();
  await db.insert(schema.conversations).values({
    id,
    title: "iMessage",
    metadata: JSON.stringify({ source: "imessage" }),
  });

  // Save to imessage_state
  try {
    await db
      .insert(schema.imessageState)
      .values({ id: "singleton", conversationId: id, lastSeenRowId })
      .onConflictDoUpdate({
        target: schema.imessageState.id,
        set: { conversationId: id },
      });
  } catch {
    // Fallback: just update
    try {
      await db
        .update(schema.imessageState)
        .set({ conversationId: id })
        .where(eq(schema.imessageState.id, "singleton"));
    } catch {
      // First time, insert
      await db
        .insert(schema.imessageState)
        .values({ id: "singleton", conversationId: id, lastSeenRowId });
    }
  }

  imessageConversationId = id;
  console.log(`[Richy:iMessage] Created iMessage conversation: ${id}`);
  return id;
}

/**
 * Load last seen ROWID from the database (survives restarts).
 */
function loadLastSeenRowId(): void {
  try {
    const state = db
      .select()
      .from(schema.imessageState)
      .where(eq(schema.imessageState.id, "singleton"))
      .all();

    if (state.length > 0 && state[0].lastSeenRowId) {
      lastSeenRowId = state[0].lastSeenRowId;
    }
  } catch {
    // Table may not exist yet
  }
}

/**
 * Persist lastSeenRowId to the database.
 */
async function saveLastSeenRowId(rowId: string): Promise<void> {
  lastSeenRowId = rowId;
  try {
    await db
      .update(schema.imessageState)
      .set({ lastSeenRowId: rowId, updatedAt: new Date() })
      .where(eq(schema.imessageState.id, "singleton"));
  } catch {
    try {
      await db.insert(schema.imessageState).values({
        id: "singleton",
        lastSeenRowId: rowId,
      });
    } catch {
      // Already exists, try update again
    }
  }
}

/**
 * Handle a single incoming iMessage.
 */
async function handleIncomingMessage(
  text: string,
  userPhone: string
): Promise<void> {
  console.log(`[Richy:iMessage] Received: "${text.substring(0, 50)}..."`);

  const conversationId = await getOrCreateConversation();

  try {
    const result = await runAgent({
      conversationId,
      userMessage: text,
      systemContext:
        "This message arrived via iMessage from the user's phone. Keep your response concise and SMS-friendly (no markdown, no code blocks unless asked). Be conversational.",
      historyLimit: 6,
      skipMemoryExtraction: true,
    });

    // Send response back via iMessage
    if (result.text) {
      await sendIMessage(userPhone, result.text);
      console.log(
        `[Richy:iMessage] Replied: "${result.text.substring(0, 50)}..."`
      );
    }

    // Reset on success
    consecutiveErrors = 0;
    errorBackoffMs = 0;
  } catch (error: any) {
    consecutiveErrors++;
    console.error(
      `[Richy:iMessage] Agent error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
      error.message
    );

    // Only send error iMessage on first failure to avoid feedback loops
    if (consecutiveErrors === 1) {
      try {
        await sendIMessage(
          userPhone,
          "Sorry, I ran into an error processing that. Try again in a moment."
        );
      } catch {
        // Can't even send error message, just log
      }
    }

    // Back off exponentially after repeated errors
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      errorBackoffMs = Math.min(30000 * consecutiveErrors, 300000); // up to 5 min
      console.warn(
        `[Richy:iMessage] ${consecutiveErrors} consecutive errors, backing off ${errorBackoffMs / 1000}s`
      );
      // Drain the queue to stop processing stale messages
      messageQueue.length = 0;
    }
  }
}

/**
 * Process the message queue sequentially.
 */
async function processQueue(userPhone: string): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (messageQueue.length > 0) {
      const text = messageQueue.shift()!;
      await handleIncomingMessage(text, userPhone);
    }
  } finally {
    processing = false;
  }
}

/**
 * Single poll tick: check for new messages.
 */
async function pollTick(): Promise<void> {
  // Check if autonomous mode is still on
  const mode = getSettingSync("autonomous_mode");
  if (mode !== "on") return;

  const rawPhone = getSettingSync("user_phone");
  if (!rawPhone) return;
  const userPhone = String(rawPhone);

  // Respect error backoff
  if (errorBackoffMs > 0) {
    errorBackoffMs = Math.max(0, errorBackoffMs - 10000);
    return;
  }

  try {
    const newMessages = getNewMessages(userPhone, lastSeenRowId);

    if (newMessages.length > 0) {
      // Update lastSeenRowId to the highest ROWID (even for echoes)
      const maxRowId = newMessages[newMessages.length - 1].id;
      await saveLastSeenRowId(maxRowId);

      // Filter out echo messages (our own sent messages bouncing back via iCloud sync)
      // Also filter by sender allowlist — only process from configured user_phone
      const normalizedUserPhone = userPhone.replace(/[\s\-\(\)\.]/g, "").slice(-10);
      const incoming = newMessages.filter((msg) => {
        if (isEchoMessage(msg.text)) return false;
        // Sender allowlist: only accept from the configured user phone
        const normalizedSender = msg.sender?.replace(/[\s\-\(\)\.]/g, "").slice(-10) || "";
        if (normalizedSender && normalizedUserPhone && normalizedSender !== normalizedUserPhone) {
          console.warn(`[Richy:iMessage] Rejected message from unknown sender: ${msg.sender}`);
          return false;
        }
        return true;
      });
      if (incoming.length === 0) return;

      console.log(
        `[Richy:iMessage] Found ${incoming.length} new message(s)${incoming.length < newMessages.length ? ` (filtered ${newMessages.length - incoming.length} echo(es))` : ""}`
      );

      // Enqueue messages (with queue size limit)
      for (const msg of incoming) {
        if (messageQueue.length >= MAX_QUEUE_SIZE) {
          console.warn("[Richy:iMessage] Queue full — dropping oldest messages");
          messageQueue.shift(); // Drop oldest
        }
        messageQueue.push(msg.text);
      }

      // Process queue
      processQueue(userPhone).catch((err) => {
        console.error("[Richy:iMessage] Queue processing error:", err.message);
      });
    }
  } catch (error: any) {
    // Only log if it's a new error
    if (error.message !== lastLoggedError) {
      console.error("[Richy:iMessage] Poll error:", error.message);
      lastLoggedError = error.message;
    }
    errorBackoffMs = Math.min(errorBackoffMs + 30000, 120000);
  }
}

/**
 * Start the iMessage polling loop.
 */
export async function startIMessagePolling(): Promise<void> {
  const mode = getSettingSync("autonomous_mode");
  if (mode !== "on") {
    console.log(
      "[Richy:iMessage] Autonomous mode is off. Polling not started."
    );
    return;
  }

  const rawPhone = getSettingSync("user_phone");
  if (!rawPhone) {
    console.log(
      "[Richy:iMessage] No user_phone configured. Polling not started."
    );
    return;
  }
  const userPhone = String(rawPhone);

  // Load persisted state
  loadLastSeenRowId();

  // If first time, set cursor to current latest to avoid replaying old messages
  if (lastSeenRowId === "0") {
    const latestId = getLatestRowId(userPhone);
    if (latestId !== "0") {
      lastSeenRowId = latestId;
      await saveLastSeenRowId(latestId);
      console.log(
        `[Richy:iMessage] Initialized cursor to ROWID ${latestId}`
      );
    }
  }

  const intervalSec =
    parseInt(getSettingSync("imessage_polling_interval") || "10", 10) || 10;

  pollTimer = setInterval(() => {
    pollTick().catch((err) => {
      console.error("[Richy:iMessage] Unhandled poll error:", err.message);
    });
  }, intervalSec * 1000);

  console.log(
    `[Richy:iMessage] Polling started (every ${intervalSec}s for ${userPhone})`
  );
}

/**
 * Stop the iMessage polling loop.
 */
export function stopIMessagePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[Richy:iMessage] Polling stopped");
  }
}
