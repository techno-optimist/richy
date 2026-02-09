import { db, schema } from "../db";
import { eq, and, lte } from "drizzle-orm";
import { runAgent } from "../agent/runner";
import { nanoid } from "nanoid";
import { CronExpressionParser } from "cron-parser";
import { getSettingSync } from "../db/settings";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let taskConversationId: string | null = null;

/**
 * Get or create the conversation used for task executions.
 */
async function getOrCreateTaskConversation(): Promise<string> {
  if (taskConversationId) return taskConversationId;

  // Look for existing task conversation
  const existing = db
    .select()
    .from(schema.conversations)
    .all()
    .filter((c) => {
      if (!c.metadata) return false;
      try {
        const meta = JSON.parse(c.metadata);
        return meta.source === "task-scheduler";
      } catch {
        return false;
      }
    });

  if (existing.length > 0) {
    taskConversationId = existing[0].id;
    return taskConversationId;
  }

  // Create new
  const id = nanoid();
  await db.insert(schema.conversations).values({
    id,
    title: "Scheduled Tasks",
    metadata: JSON.stringify({ source: "task-scheduler" }),
  });

  taskConversationId = id;
  console.log(`[Richy:Scheduler] Created task conversation: ${id}`);
  return id;
}

/**
 * Calculate the next run time for a cron expression.
 */
function getNextRunTime(cronExpression: string): Date {
  const interval = CronExpressionParser.parse(cronExpression);
  return interval.next().toDate();
}

interface TaskAction {
  type: "agent_prompt";
  prompt: string;
  notify?: boolean;
  conversationId?: string;
  /** When true, uses Claude instead of background model (for code/tool tasks) */
  useMainModel?: boolean;
}

/**
 * Execute a single task.
 */
async function executeTask(
  task: typeof schema.tasks.$inferSelect
): Promise<void> {
  console.log(`[Richy:Scheduler] Executing task "${task.name}" (${task.id})`);

  let action: TaskAction;
  try {
    action = JSON.parse(task.action) as TaskAction;
  } catch {
    console.error(
      `[Richy:Scheduler] Invalid action JSON for task ${task.id}`
    );
    await db
      .update(schema.tasks)
      .set({ status: "failed", result: "Invalid action JSON" })
      .where(eq(schema.tasks.id, task.id));
    return;
  }

  try {
    const conversationId =
      action.conversationId || (await getOrCreateTaskConversation());

    // Only use Claude when the task explicitly requests it — all other tasks
    // use the background model (Ollama) to avoid burning Claude API tokens.
    // Previously this regex matched "monitor", "scan", "market", "crypto", etc.
    // which routed every scheduled task to Claude unnecessarily.
    const needsMainModel =
      action.useMainModel ||
      /\b(tool_create|self_modify|write.*code|create.*tool|build.*tool|implement|refactor)\b/i.test(
        action.prompt
      );

    const result = await runAgent({
      conversationId,
      userMessage: `[Scheduled Task: ${task.name}] ${action.prompt}`,
      systemContext: `This is an automated task execution. Task name: "${task.name}". Execute the requested action and provide a clear summary of what you did.`,
      historyLimit: 0,
      skipMemoryExtraction: true,
      useMainModel: needsMainModel,
    });

    // Notify via preferred channel
    if (action.notify !== false) {
      const notifyText = `[Task: ${task.name}] ${result.text}`;

      // Telegram notifications
      if (getSettingSync("notify_telegram") === "on") {
        const telegramToken = getSettingSync("telegram_bot_token");
        if (telegramToken) {
          try {
            const { sendTelegramMessage } = await import("../telegram/bot");
            const chats = db
              .select()
              .from(schema.telegramState)
              .all()
              .filter((row) => row.chatId);

            if (chats.length > 0) {
              const truncated =
                notifyText.length > 4000
                  ? notifyText.substring(0, 3997) + "..."
                  : notifyText;
              await sendTelegramMessage(chats[0].chatId!, truncated);
            }
          } catch (err: any) {
            console.error(
              `[Richy:Scheduler] Failed to send Telegram notification:`,
              err.message
            );
          }
        }
      }

      // iMessage notifications
      if (getSettingSync("notify_imessage") === "on") {
        const rawPhone = getSettingSync("user_phone");
        if (rawPhone) {
          const userPhone = String(rawPhone);
          try {
            const { sendIMessage } = await import("../imessage/applescript");
            const truncated =
              notifyText.length > 1000
                ? notifyText.substring(0, 997) + "..."
                : notifyText;
            await sendIMessage(userPhone, truncated);
          } catch (err: any) {
            console.error(
              `[Richy:Scheduler] Failed to send iMessage notification:`,
              err.message
            );
          }
        }
      }
    }

    // Update task
    const updates: Record<string, any> = {
      lastRunAt: new Date(),
      result: result.text,
    };

    if (task.type === "cron" && task.schedule) {
      // Calculate next run
      try {
        updates.nextRunAt = getNextRunTime(task.schedule);
        console.log(
          `[Richy:Scheduler] Next run for "${task.name}": ${updates.nextRunAt.toLocaleString()}`
        );
      } catch {
        updates.status = "failed";
        updates.result = "Invalid cron expression";
      }
    } else {
      // One-time task — mark completed
      updates.status = "completed";
    }

    await db
      .update(schema.tasks)
      .set(updates)
      .where(eq(schema.tasks.id, task.id));

    console.log(`[Richy:Scheduler] Task "${task.name}" completed`);
  } catch (error: any) {
    console.error(
      `[Richy:Scheduler] Task "${task.name}" failed:`,
      error.message
    );
    await db
      .update(schema.tasks)
      .set({
        lastRunAt: new Date(),
        status: "failed",
        result: `Error: ${error.message}`,
      })
      .where(eq(schema.tasks.id, task.id));
  }
}

/**
 * Check for due tasks and execute them.
 */
async function checkAndRunTasks(): Promise<void> {
  try {
    const now = new Date();

    // Find due tasks
    const dueTasks = db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.status, "active"), lte(schema.tasks.nextRunAt, now)))
      .all();

    if (dueTasks.length > 0) {
      console.log(`[Richy:Scheduler] Found ${dueTasks.length} due task(s)`);

      // Execute tasks sequentially to avoid overwhelming the AI API
      for (const task of dueTasks) {
        await executeTask(task);
      }
    }
  } catch (error: any) {
    console.error("[Richy:Scheduler] Error checking tasks:", error.message);
  }
}

/**
 * Start the task scheduler.
 */
export function startTaskScheduler(): void {
  // Run check immediately, then every 60 seconds
  checkAndRunTasks().catch((err) => {
    console.error("[Richy:Scheduler] Initial check failed:", err.message);
  });

  schedulerTimer = setInterval(() => {
    checkAndRunTasks().catch((err) => {
      console.error("[Richy:Scheduler] Check failed:", err.message);
    });
  }, 60_000);

  console.log("[Richy:Scheduler] Task scheduler started (checking every 60s)");
}

/**
 * Stop the task scheduler.
 */
export function stopTaskScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Richy:Scheduler] Task scheduler stopped");
  }
}
