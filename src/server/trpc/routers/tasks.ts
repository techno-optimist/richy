import { z } from "zod/v4";
import { router, publicProcedure } from "../init";
import { schema } from "../../db";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export const tasksRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          status: z
            .enum(["active", "paused", "completed", "failed"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.db
        .select()
        .from(schema.tasks)
        .orderBy(desc(schema.tasks.createdAt));

      if (input?.status) {
        query = query.where(eq(schema.tasks.status, input.status)) as any;
      }

      return query.all();
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, input.id))
        .limit(1);
      return result[0] || null;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["once", "cron"]),
        schedule: z.string().optional(),
        action: z.string(),
        nextRunAt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = nanoid();
      await ctx.db.insert(schema.tasks).values({
        id,
        name: input.name,
        description: input.description || null,
        type: input.type,
        schedule: input.schedule || null,
        action: input.action,
        nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : null,
        status: "active",
      });
      return { id };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z
          .enum(["active", "paused", "completed", "failed"])
          .optional(),
        schedule: z.string().optional(),
        nextRunAt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const set: Record<string, any> = {};
      if (updates.name !== undefined) set.name = updates.name;
      if (updates.description !== undefined)
        set.description = updates.description;
      if (updates.status !== undefined) set.status = updates.status;
      if (updates.schedule !== undefined) set.schedule = updates.schedule;
      if (updates.nextRunAt !== undefined)
        set.nextRunAt = updates.nextRunAt
          ? new Date(updates.nextRunAt)
          : null;

      await ctx.db
        .update(schema.tasks)
        .set(set)
        .where(eq(schema.tasks.id, id));
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.tasks)
        .where(eq(schema.tasks.id, input.id));
      return { success: true };
    }),
});
