import { z } from "zod/v4";
import { router, protectedProcedure } from "../init";
import { schema } from "../../db";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export const messagesRouter = router({
  listByConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, input.conversationId))
        .orderBy(schema.messages.createdAt)
        .limit(input.limit);
      return results;
    }),

  save: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.string().nullable().optional(),
        parts: z.string().nullable().optional(),
        toolCalls: z.string().nullable().optional(),
        toolResults: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        tokenUsage: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = nanoid();
      await ctx.db.insert(schema.messages).values({
        id,
        ...input,
      });

      // Update conversation's updatedAt
      await ctx.db
        .update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversations.id, input.conversationId));

      return { id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.messages)
        .where(eq(schema.messages.id, input.id));
      return { success: true };
    }),
});
