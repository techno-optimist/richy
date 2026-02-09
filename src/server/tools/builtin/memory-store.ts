import { z } from "zod/v4";
import { db, schema } from "../../db";
import { like, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { RichyToolDef } from "../types";
import { generateEmbedding } from "../../memory/embeddings";
import { semanticSearch } from "../../memory/search";

export const memoryStoreTool: RichyToolDef = {
  name: "memory_store",
  displayName: "Memory Store",
  description:
    "Store or recall information about the user. Use 'remember' to save important facts, preferences, or patterns. Use 'recall' to search for previously stored memories using semantic search.",
  category: "memory",
  parameters: z.object({
    action: z
      .enum(["remember", "recall"])
      .describe("Whether to store or retrieve a memory"),
    content: z
      .string()
      .describe(
        "For 'remember': the fact to store. For 'recall': the search query."
      ),
    type: z
      .enum(["fact", "preference", "pattern", "note", "entity"])
      .optional()
      .describe("Type of memory (for remember action)"),
  }),
  execute: async (input: {
    action: string;
    content: string;
    type?: string;
  }) => {
    if (input.action === "remember") {
      const id = nanoid();

      // Generate embedding for the memory
      let embedding: string | null = null;
      try {
        const vec = await generateEmbedding(input.content);
        embedding = JSON.stringify(vec);
      } catch {
        // Continue without embedding
      }

      await db.insert(schema.memories).values({
        id,
        type: (input.type as any) || "fact",
        content: input.content,
        embedding,
        source: "agent",
      });
      return {
        success: true,
        output: `Remembered: "${input.content}"`,
        data: { id },
      };
    }

    // recall — use semantic search
    try {
      const results = await semanticSearch(input.content, 10, 0.2);

      if (results.length === 0) {
        return {
          success: true,
          output: `No memories found matching "${input.content}"`,
          data: { results: [] },
        };
      }

      const formatted = results
        .map(
          (m) =>
            `- [${m.type}] ${m.content} (relevance: ${(m.similarity * 100).toFixed(0)}%)`
        )
        .join("\n");

      return {
        success: true,
        output: `Found ${results.length} memories:\n${formatted}`,
        data: { results },
      };
    } catch {
      // Fallback to keyword search
      const results = await db
        .select()
        .from(schema.memories)
        .where(like(schema.memories.content, `%${input.content.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`))
        .orderBy(desc(schema.memories.createdAt))
        .limit(10);

      if (results.length === 0) {
        return {
          success: true,
          output: `No memories found matching "${input.content}"`,
          data: { results: [] },
        };
      }

      const formatted = results
        .map((m) => `- [${m.type}] ${m.content}`)
        .join("\n");

      return {
        success: true,
        output: `Found ${results.length} memories:\n${formatted}`,
        data: { results },
      };
    }
  },
};
