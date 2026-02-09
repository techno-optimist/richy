import { tool, jsonSchema } from "ai";
import { calculatorTool } from "./builtin/calculator";
import { memoryStoreTool } from "./builtin/memory-store";
import { webSearchTool } from "./builtin/web-search";
import { webBrowseTool } from "./builtin/web-browse";
import { codeExecuteTool } from "./builtin/code-execute";
import { imessageTool } from "./builtin/imessage";
import { telegramTool } from "./builtin/telegram";
import { taskManageTool } from "./builtin/task-manage";
import { selfModifyTool } from "./builtin/self-modify";
import { toolCreateTool } from "./builtin/tool-create";
import { cryptoTradeTool } from "./builtin/crypto-trade";
import { soulTool } from "./builtin/soul";
import { executeCustomTool } from "./builtin/tool-create";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import type { RichyToolDef } from "./types";

export const builtinTools: RichyToolDef[] = [
  calculatorTool,
  memoryStoreTool,
  webSearchTool,
  webBrowseTool,
  codeExecuteTool,
  imessageTool,
  telegramTool,
  taskManageTool,
  selfModifyTool,
  toolCreateTool,
  cryptoTradeTool,
  soulTool,
];

export function getToolsForAgent() {
  const tools: Record<string, any> = {};

  // Register builtin tools
  for (const t of builtinTools) {
    tools[t.name] = tool({
      description: t.description,
      inputSchema: t.parameters,
      execute: async (input: any) => {
        const result = await t.execute(input);
        return result;
      },
    });
  }

  // Load custom tools from database
  try {
    const customTools = db
      .select()
      .from(schema.toolConfigs)
      .where(eq(schema.toolConfigs.type, "custom"))
      .all()
      .filter((t) => t.enabled);

    for (const ct of customTools) {
      try {
        const config = JSON.parse(ct.config);
        tools[ct.name] = tool({
          description: config.description || ct.name,
          inputSchema: jsonSchema(config.parameters || { type: "object", properties: {} }),
          execute: async (input: any) => {
            const result = await executeCustomTool(config.code, input);
            return result;
          },
        });
      } catch (err: any) {
        console.error(
          `[Richy:Registry] Failed to load custom tool "${ct.name}":`,
          err.message
        );
      }
    }
  } catch {
    // tool_configs table might not exist yet
  }

  return tools;
}

export function getToolList() {
  const list = builtinTools.map((t) => ({
    name: t.name,
    displayName: t.displayName,
    description: t.description,
    category: t.category,
  }));

  // Include custom tools
  try {
    const customTools = db
      .select()
      .from(schema.toolConfigs)
      .where(eq(schema.toolConfigs.type, "custom"))
      .all()
      .filter((t) => t.enabled);

    for (const ct of customTools) {
      try {
        const config = JSON.parse(ct.config);
        list.push({
          name: ct.name,
          displayName: config.displayName || ct.name,
          description: config.description || "",
          category: "custom" as any,
        });
      } catch {}
    }
  } catch {}

  return list;
}
