import { z } from "zod/v4";
import { router, publicProcedure } from "../init";
import { schema } from "../../db";
import { eq, desc, like, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateEmbedding } from "../../memory/embeddings";
import { semanticSearch } from "../../memory/search";

export const memoryRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          type: z
            .enum(["fact", "preference", "pattern", "note", "entity"])
            .optional(),
          limit: z.number().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = input?.type
        ? eq(schema.memories.type, input.type)
        : undefined;

      return ctx.db
        .select()
        .from(schema.memories)
        .where(conditions)
        .orderBy(desc(schema.memories.createdAt))
        .limit(limit);
    }),

  search: publicProcedure
    .input(z.object({ query: z.string(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      // Try semantic search first
      try {
        const results = await semanticSearch(input.query, input.limit, 0.2);
        if (results.length > 0) {
          return results.map((r) => ({
            id: r.id,
            type: r.type,
            content: r.content,
            importance: r.importance,
            similarity: r.similarity,
            createdAt: r.createdAt,
          }));
        }
      } catch {
        // Fallback to keyword
      }

      return ctx.db
        .select()
        .from(schema.memories)
        .where(like(schema.memories.content, `%${input.query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`))
        .orderBy(desc(schema.memories.createdAt))
        .limit(input.limit);
    }),

  create: publicProcedure
    .input(
      z.object({
        type: z.enum(["fact", "preference", "pattern", "note", "entity"]),
        content: z.string(),
        source: z.string().optional(),
        importance: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = nanoid();

      // Generate embedding
      let embedding: string | null = null;
      try {
        const vec = await generateEmbedding(input.content);
        embedding = JSON.stringify(vec);
      } catch {
        // Continue without embedding
      }

      await ctx.db.insert(schema.memories).values({
        id,
        ...input,
        embedding,
      });
      return { id };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string().optional(),
        type: z
          .enum(["fact", "preference", "pattern", "note", "entity"])
          .optional(),
        importance: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await ctx.db
        .update(schema.memories)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.memories.id, id));
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.memories)
        .where(eq(schema.memories.id, input.id));
      return { success: true };
    }),

  stats: publicProcedure.query(async ({ ctx }) => {
    const results = await ctx.db
      .select({
        type: schema.memories.type,
        count: sql<number>`count(*)`,
      })
      .from(schema.memories)
      .groupBy(schema.memories.type);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    return { byType: results, total };
  }),
});
