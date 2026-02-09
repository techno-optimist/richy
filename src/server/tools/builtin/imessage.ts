import { z } from "zod/v4";
import type { RichyToolDef } from "../types";
import { sendIMessage, readIMessages } from "../../imessage/applescript";

export const imessageTool: RichyToolDef = {
  name: "imessage",
  displayName: "iMessage",
  description:
    "Send and read iMessages. Use 'send' to message someone, 'read' to check recent messages from a contact.",
  category: "system",
  parameters: z.object({
    action: z.enum(["send", "read"]).describe("Send or read messages"),
    recipient: z
      .string()
      .describe("Phone number or email to send to or read from"),
    message: z
      .string()
      .optional()
      .describe("Message text (required for send action)"),
    limit: z
      .number()
      .optional()
      .describe("Number of messages to read (default 10)"),
  }),
  execute: async (input: {
    action: string;
    recipient: string;
    message?: string;
    limit?: number;
  }) => {
    if (input.action === "send") {
      if (!input.message) {
        return {
          success: false,
          output: "Message text is required for send action",
        };
      }
      try {
        await sendIMessage(input.recipient, input.message);
        return {
          success: true,
          output: `Sent iMessage to ${input.recipient}: "${input.message}"`,
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to send iMessage: ${error.message}`,
        };
      }
    }

    if (input.action === "read") {
      try {
        const messages = readIMessages(input.recipient, input.limit ?? 10);
        if (messages.length === 0) {
          return {
            success: true,
            output: `No messages found for ${input.recipient}`,
          };
        }
        const formatted = messages
          .map(
            (m) =>
              `[${m.date.toLocaleString()}] ${m.isFromMe ? "Me" : m.sender}: ${m.text}`
          )
          .join("\n");
        return {
          success: true,
          output: formatted,
          data: { count: messages.length },
        };
      } catch (error: any) {
        return {
          success: false,
          output: `Failed to read messages: ${error.message}`,
        };
      }
    }

    return { success: false, output: "Invalid action. Use 'send' or 'read'." };
  },
};
