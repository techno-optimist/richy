import { z } from "zod/v4";
import { router, publicProcedure } from "../init";
import { schema } from "../../db";
import { eq } from "drizzle-orm";
import { builtinTools } from "../../tools/registry";

type ToolInfo = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  type: "builtin" | "custom";
  enabled: boolean;
  createdAt: Date | null;
};

export const toolsRouter = router({
  list: publicProcedure.query(async ({ ctx }): Promise<ToolInfo[]> => {
    const builtins: ToolInfo[] = builtinTools.map((t) => ({
      id: t.name,
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      category: t.category,
      type: "builtin",
      enabled: true,
      createdAt: null,
    }));

    let custom: ToolInfo[] = [];
    try {
      const rows = ctx.db
        .select()
        .from(schema.toolConfigs)
        .where(eq(schema.toolConfigs.type, "custom"))
        .all();

      custom = rows.map((t) => {
        const config = JSON.parse(t.config);
        return {
          id: t.id,
          name: t.name,
          displayName: (config.displayName || t.name) as string,
          description: (config.description || "") as string,
          category: "custom",
          type: "custom" as const,
          enabled: t.enabled ?? true,
          createdAt: t.createdAt ?? null,
        };
      });
    } catch {
      // tool_configs table might not exist yet
    }

    return [...builtins, ...custom];
  }),

  toggle: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.toolConfigs)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(eq(schema.toolConfigs.id, input.id));
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.toolConfigs)
        .where(eq(schema.toolConfigs.id, input.id));
      return { success: true };
    }),
});
