import { z } from "zod/v4";
import type { RichyToolDef } from "../types";
import { sendTelegramMessage } from "../../telegram/bot";
import { db, schema } from "../../db";

export const telegramTool: RichyToolDef = {
  name: "telegram",
  displayName: "Telegram",
  description:
    "Send a Telegram message or list known chats. Use 'send' to message a user, 'list_chats' to see known conversations.",
  category: "system",
  parameters: z.object({
    action: z
      .enum(["send", "list_chats"])
      .describe("'send' to send a message, 'list_chats' to see known chats"),
    chat_id: z
      .string()
      .optional()
      .describe("Telegram chat ID to send to (required for send)"),
    message: z
      .string()
      .optional()
      .describe("Message text (required for send)"),
  }),
  execute: async (input: {
    action: string;
    chat_id?: string;
    message?: string;
  }) => {
    if (input.action === "send") {
      if (!input.chat_id) {
        return { success: false, output: "chat_id is required for send action" };
      }
      if (!input.message) {
        return { success: false, output: "message is required for send action" };
      }

      try {
        await sendTelegramMessage(input.chat_id, input.message);
        return {
          success: true,
          output: `Sent Telegram message to chat ${input.chat_id}`,
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to send Telegram message: ${error.message}`,
        };
      }
    }

    if (input.action === "list_chats") {
      try {
        const chats = db
          .select()
          .from(schema.telegramState)
          .all()
          .filter((row) => row.chatId);

        if (chats.length === 0) {
          return {
            success: true,
            output:
              "No known Telegram chats yet. Users need to message the bot first.",
          };
        }

        const formatted = chats
          .map(
            (c) =>
              `- Chat ID: ${c.chatId}${c.username ? ` (@${c.username})` : ""} → Conversation: ${c.conversationId}`
          )
          .join("\n");

        return {
          success: true,
          output: `Known Telegram chats:\n${formatted}`,
          data: { count: chats.length },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to list chats: ${error.message}`,
        };
      }
    }

    return { success: false, output: "Invalid action. Use 'send' or 'list_chats'." };
  },
};
