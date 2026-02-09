import { z } from "zod/v4";
import type { RichyToolDef } from "../types";
import { db, schema } from "../../db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { CronExpressionParser } from "cron-parser";

function getNextRunTime(cronExpression: string): Date {
  const interval = CronExpressionParser.parse(cronExpression);
  return interval.next().toDate();
}

export const taskManageTool: RichyToolDef = {
  name: "task_manage",
  displayName: "Task Manager",
  description:
    "Create, list, or cancel scheduled tasks. Use this to set reminders, schedule recurring checks, or plan future actions. Tasks run automatically and can notify the user via iMessage.",
  category: "system",
  parameters: z.object({
    action: z
      .enum(["create", "list", "cancel"])
      .describe("Action to perform"),
    name: z.string().optional().describe("Task name (for create)"),
    taskType: z
      .enum(["once", "cron"])
      .optional()
      .describe(
        "once = run once at scheduled time, cron = recurring (for create)"
      ),
    schedule: z
      .string()
      .optional()
      .describe(
        "For 'once': ISO datetime (e.g. '2025-01-15T09:00:00'). For 'cron': cron expression (e.g. '0 9 * * *' for daily at 9am)"
      ),
    prompt: z
      .string()
      .optional()
      .describe(
        "What the agent should do when this task runs (for create)"
      ),
    notify: z
      .boolean()
      .optional()
      .describe("Send the result via iMessage (default true, for create)"),
    taskId: z.string().optional().describe("Task ID (for cancel)"),
  }),
  execute: async (input: {
    action: string;
    name?: string;
    taskType?: string;
    schedule?: string;
    prompt?: string;
    notify?: boolean;
    taskId?: string;
  }) => {
    if (input.action === "create") {
      if (!input.name || !input.taskType || !input.schedule || !input.prompt) {
        return {
          success: false,
          output:
            "Missing required fields for create: name, taskType, schedule, prompt",
        };
      }

      const id = nanoid();
      const notify = input.notify !== false; // default true

      let nextRunAt: Date;
      if (input.taskType === "cron") {
        try {
          nextRunAt = getNextRunTime(input.schedule);
        } catch {
          return {
            success: false,
            output: `Invalid cron expression: "${input.schedule}"`,
          };
        }
      } else {
        // "once" — parse ISO datetime
        nextRunAt = new Date(input.schedule);
        if (isNaN(nextRunAt.getTime())) {
          return {
            success: false,
            output: `Invalid datetime: "${input.schedule}". Use ISO format like 2025-01-15T09:00:00`,
          };
        }
      }

      const action = JSON.stringify({
        type: "agent_prompt",
        prompt: input.prompt,
        notify,
      });

      await db.insert(schema.tasks).values({
        id,
        name: input.name,
        type: input.taskType as "once" | "cron",
        schedule: input.schedule,
        nextRunAt,
        status: "active",
        action,
      });

      return {
        success: true,
        output: `Created ${input.taskType} task "${input.name}" (ID: ${id}). Next run: ${nextRunAt.toLocaleString()}`,
        data: { id, nextRunAt: nextRunAt.toISOString() },
      };
    }

    if (input.action === "list") {
      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.status, "active"),
          )
        );

      if (tasks.length === 0) {
        return { success: true, output: "No active tasks." };
      }

      const formatted = tasks
        .map(
          (t) =>
            `- [${t.id}] "${t.name}" (${t.type}) — next: ${t.nextRunAt ? new Date(t.nextRunAt).toLocaleString() : "N/A"}`
        )
        .join("\n");

      return {
        success: true,
        output: `Active tasks:\n${formatted}`,
        data: { count: tasks.length },
      };
    }

    if (input.action === "cancel") {
      if (!input.taskId) {
        return { success: false, output: "taskId is required for cancel" };
      }

      const result = await db
        .update(schema.tasks)
        .set({ status: "paused" })
        .where(eq(schema.tasks.id, input.taskId));

      return {
        success: true,
        output: `Cancelled task ${input.taskId}`,
      };
    }

    return {
      success: false,
      output: "Invalid action. Use 'create', 'list', or 'cancel'.",
    };
  },
};
