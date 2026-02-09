import { z } from "zod/v4";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { RichyToolDef } from "../types";

const SOUL_PATH = join(process.cwd(), "soul.md");

function readSoul(): string {
  if (!existsSync(SOUL_PATH)) {
    return "(No soul.md file found. Use the 'update' action to create one.)";
  }
  return readFileSync(SOUL_PATH, "utf-8");
}

function writeSoul(content: string): void {
  writeFileSync(SOUL_PATH, content, "utf-8");
}

export const soulTool: RichyToolDef = {
  name: "soul",
  displayName: "Soul",
  description:
    "Read or update your soul.md — your living identity document that defines who you are, how you communicate, and what you value. Use 'read' to reflect on your current identity. Use 'update' to evolve it with new insights. Use 'append_growth' to add a growth entry without rewriting the whole file. Soul updates should be rare and meaningful — not every conversation warrants one.",
  category: "system",
  parameters: z.object({
    action: z
      .enum(["read", "update", "append_growth"])
      .describe(
        "'read' to see current soul. 'update' to rewrite it (provide full new content). 'append_growth' to add a single growth entry."
      ),
    content: z
      .string()
      .optional()
      .describe(
        "For 'update': the full new soul.md content. For 'append_growth': a single insight or reflection to add to the Growth section."
      ),
  }),
  execute: async (input: { action: string; content?: string }) => {
    if (input.action === "read") {
      const soul = readSoul();
      return {
        success: true,
        output: soul,
      };
    }

    if (input.action === "update") {
      if (!input.content) {
        return {
          success: false,
          output: "No content provided for update.",
        };
      }
      writeSoul(input.content);
      return {
        success: true,
        output: "Soul updated. Your identity has evolved.",
      };
    }

    if (input.action === "append_growth") {
      if (!input.content) {
        return {
          success: false,
          output: "No content provided for growth entry.",
        };
      }

      const current = readSoul();
      const date = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const entry = `- **${date}:** ${input.content}`;

      // Append to the end of the file (after the Growth section)
      const updated = current.trimEnd() + "\n" + entry + "\n";
      writeSoul(updated);

      return {
        success: true,
        output: `Growth entry added: "${input.content}"`,
      };
    }

    return {
      success: false,
      output: `Unknown action: ${input.action}`,
    };
  },
};
