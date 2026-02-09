import { z } from "zod/v4";
import { router, publicProcedure } from "../init";
import { schema } from "../../db";
import { eq, desc, like, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export const conversationsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          includeArchived: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = input?.includeArchived
        ? undefined
        : eq(schema.conversations.archived, false);

      const results = await ctx.db
        .select()
        .from(schema.conversations)
        .where(conditions)
        .orderBy(desc(schema.conversations.updatedAt))
        .limit(limit);

      return results;
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, input.id))
        .limit(1);
      return result[0] ?? null;
    }),

  create: publicProcedure
    .input(
      z
        .object({
          title: z.string().optional(),
          metadata: z.string().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const id = nanoid();
      await ctx.db.insert(schema.conversations).values({
        id,
        title: input?.title ?? "New conversation",
        metadata: input?.metadata,
      });
      return { id };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        metadata: z.string().optional(),
        archived: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await ctx.db
        .update(schema.conversations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.conversations.id, id));
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.conversations)
        .where(eq(schema.conversations.id, input.id));
      return { success: true };
    }),

  search: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(schema.conversations)
        .where(
          and(
            like(schema.conversations.title, `%${input.query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`),
            eq(schema.conversations.archived, false)
          )
        )
        .orderBy(desc(schema.conversations.updatedAt))
        .limit(20);
      return results;
    }),
});
