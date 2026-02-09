import { execFile } from "child_process";
import { promisify } from "util";
import Database from "better-sqlite3";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

/**
 * Track recently sent messages to detect echo/bounce-back.
 * When Mac and phone share the same Apple ID, sent iMessages
 * appear back in chat.db as is_from_me=0 with a new ROWID.
 * Uses a counter so multiple sends of the same text are all tracked.
 */
const recentlySent = new Map<string, { count: number; timestamp: number }>();

function trackSentMessage(text: string): void {
  const trimmed = text.trim();
  const existing = recentlySent.get(trimmed);
  if (existing) {
    existing.count++;
    existing.timestamp = Date.now();
  } else {
    recentlySent.set(trimmed, { count: 1, timestamp: Date.now() });
  }
  // Prune entries older than 5 minutes
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, data] of recentlySent) {
    if (data.timestamp < cutoff) recentlySent.delete(key);
  }
}

/**
 * Check if a received message is an echo of something we recently sent.
 * Decrements the counter so each send is matched to one echo.
 */
export function isEchoMessage(text: string): boolean {
  const trimmed = text.trim();
  const entry = recentlySent.get(trimmed);
  if (entry && entry.count > 0) {
    entry.count--;
    if (entry.count === 0) recentlySent.delete(trimmed);
    return true;
  }
  return false;
}

export interface iMessageEntry {
  id: string; // ROWID from Messages database
  text: string;
  date: Date;
  isFromMe: boolean;
  sender: string; // phone number or email
}

/**
 * Normalize a phone number for matching.
 * Strips spaces, dashes, parens. Ensures comparison works.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, "");
}

/**
 * Escape a string for use inside AppleScript double-quoted strings.
 */
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Convert macOS Messages date to JS Date.
 * Modern macOS (10.13+) stores dates as nanoseconds since 2001-01-01.
 */
function cocoaToDate(timestamp: number): Date {
  // Apple Cocoa epoch: 2001-01-01 00:00:00 UTC = 978307200 Unix seconds
  const COCOA_EPOCH_OFFSET = 978307200;

  if (timestamp > 1e15) {
    // Nanoseconds (modern macOS)
    return new Date((timestamp / 1e9 + COCOA_EPOCH_OFFSET) * 1000);
  } else if (timestamp > 1e9) {
    // Already seconds (older macOS)
    return new Date((timestamp + COCOA_EPOCH_OFFSET) * 1000);
  }
  // Fallback
  return new Date(timestamp);
}

/**
 * Get the path to the macOS Messages database.
 */
function getChatDbPath(): string {
  return path.join(os.homedir(), "Library", "Messages", "chat.db");
}

/**
 * Open the Messages database read-only.
 * Returns null if not accessible (Full Disk Access required).
 */
function openChatDb(): Database.Database | null {
  try {
    const dbPath = getChatDbPath();
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (error) {
    console.warn(
      "[Richy:iMessage] Cannot open chat.db — Full Disk Access may be required for Terminal/Node"
    );
    return null;
  }
}

/**
 * Send an iMessage to a phone number or email.
 */
export async function sendIMessage(
  recipient: string,
  message: string
): Promise<void> {
  const escapedRecipient = escapeAppleScript(recipient);
  const escapedMessage = escapeAppleScript(message);

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${escapedRecipient}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 15000 });
    trackSentMessage(message);
    console.log(`[Richy:iMessage] Sent message to ${recipient}`);
  } catch (error: any) {
    console.error(
      `[Richy:iMessage] Failed to send message:`,
      error.stderr || error.message
    );
    throw new Error(`Failed to send iMessage: ${error.message}`);
  }
}

/**
 * Read recent messages from a specific phone number.
 * Uses the macOS Messages SQLite database directly for reliability.
 */
export function readIMessages(
  phoneNumber: string,
  limit: number = 20
): iMessageEntry[] {
  const chatDb = openChatDb();
  if (!chatDb) return [];

  try {
    const normalized = normalizePhone(phoneNumber);
    const pattern = `%${normalized.slice(-10)}%`; // match last 10 digits

    const rows = chatDb
      .prepare(
        `
      SELECT m.ROWID, m.text, m.date, m.is_from_me, h.id as sender
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat ch ON cmj.chat_id = ch.ROWID
      JOIN chat_handle_join chj ON ch.ROWID = chj.chat_id
      JOIN handle h ON chj.handle_id = h.ROWID
      WHERE REPLACE(REPLACE(REPLACE(h.id, '-', ''), ' ', ''), '+', '') LIKE ?
        AND m.text IS NOT NULL
      ORDER BY m.ROWID DESC
      LIMIT ?
    `
      )
      .all(pattern, limit) as any[];

    return rows.reverse().map((row) => ({
      id: String(row.ROWID),
      text: row.text,
      date: cocoaToDate(row.date),
      isFromMe: row.is_from_me === 1,
      sender: row.sender,
    }));
  } catch (error: any) {
    console.error(
      "[Richy:iMessage] Error reading messages:",
      error.message
    );
    return [];
  } finally {
    chatDb.close();
  }
}

/**
 * Get new incoming messages from a phone number after a given ROWID.
 * Only returns messages NOT from me (incoming only).
 * This is the key function for the polling loop.
 */
export function getNewMessages(
  phoneNumber: string,
  afterRowId: string
): iMessageEntry[] {
  const chatDb = openChatDb();
  if (!chatDb) return [];

  try {
    const normalized = normalizePhone(phoneNumber);
    const pattern = `%${normalized.slice(-10)}%`;
    const rowId = parseInt(afterRowId, 10) || 0;

    const rows = chatDb
      .prepare(
        `
      SELECT m.ROWID, m.text, m.date, m.is_from_me, h.id as sender
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat ch ON cmj.chat_id = ch.ROWID
      JOIN chat_handle_join chj ON ch.ROWID = chj.chat_id
      JOIN handle h ON chj.handle_id = h.ROWID
      WHERE REPLACE(REPLACE(REPLACE(h.id, '-', ''), ' ', ''), '+', '') LIKE ?
        AND m.ROWID > ?
        AND m.is_from_me = 0
        AND m.text IS NOT NULL
      ORDER BY m.ROWID ASC
    `
      )
      .all(pattern, rowId) as any[];

    return rows.map((row) => ({
      id: String(row.ROWID),
      text: row.text,
      date: cocoaToDate(row.date),
      isFromMe: false,
      sender: row.sender,
    }));
  } catch (error: any) {
    console.error(
      "[Richy:iMessage] Error getting new messages:",
      error.message
    );
    return [];
  } finally {
    chatDb.close();
  }
}

/**
 * Get the highest ROWID for a phone number's messages.
 * Used to initialize the polling "cursor" on first start.
 */
export function getLatestRowId(phoneNumber: string): string {
  const chatDb = openChatDb();
  if (!chatDb) return "0";

  try {
    const normalized = normalizePhone(phoneNumber);
    const pattern = `%${normalized.slice(-10)}%`;

    const row = chatDb
      .prepare(
        `
      SELECT MAX(m.ROWID) as maxRowId
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat ch ON cmj.chat_id = ch.ROWID
      JOIN chat_handle_join chj ON ch.ROWID = chj.chat_id
      JOIN handle h ON chj.handle_id = h.ROWID
      WHERE REPLACE(REPLACE(REPLACE(h.id, '-', ''), ' ', ''), '+', '') LIKE ?
    `
      )
      .get(pattern) as any;

    return row?.maxRowId ? String(row.maxRowId) : "0";
  } catch {
    return "0";
  } finally {
    chatDb.close();
  }
}
