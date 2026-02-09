import { z } from "zod/v4";
import { nanoid } from "nanoid";
import vm from "vm";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import type { RichyToolDef } from "../types";

function logEvolution(
  type: string,
  description: string,
  details?: Record<string, any>
) {
  try {
    db.insert(schema.evolutionLog)
      .values({
        id: nanoid(),
        type: type as any,
        description,
        details: details ? JSON.stringify(details) : null,
      })
      .run();
  } catch {
    // Table might not exist yet
  }
}

/**
 * Execute custom tool code in a sandboxed vm context.
 * The code has access to fetch, JSON, Math, Date, and the input variable.
 * Code should return { success: boolean, output: string }.
 */
export async function executeCustomTool(
  code: string,
  input: any
): Promise<{ success: boolean; output: string }> {
  const logs: string[] = [];

  const sandbox = {
    input,
    fetch: globalThis.fetch,
    URL,
    URLSearchParams,
    console: {
      log: (...args: any[]) => logs.push(args.map(String).join(" ")),
      error: (...args: any[]) =>
        logs.push("[ERROR] " + args.map(String).join(" ")),
    },
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    RegExp,
    Error,
    Promise,
    Buffer,
    TextEncoder,
    TextDecoder,
    setTimeout: globalThis.setTimeout,
    encodeURIComponent,
    decodeURIComponent,
  };

  const context = vm.createContext(sandbox);

  // Wrap in async IIFE so tools can use await
  const wrappedCode = `(async () => { ${code} })()`;

  const script = new vm.Script(wrappedCode);
  const resultPromise = script.runInContext(context, { timeout: 30000 });
  const result = await Promise.race([
    resultPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tool execution timed out (30s)")), 30000)
    ),
  ]);

  // If the code returned a proper result object, use it
  if (result && typeof result === "object" && "output" in result) {
    return {
      success: result.success !== false,
      output: String(result.output),
    };
  }

  // Otherwise, use console output or stringified result
  const output = logs.length > 0 ? logs.join("\n") : String(result ?? "(no output)");
  return { success: true, output };
}

export const toolCreateTool: RichyToolDef = {
  name: "tool_create",
  displayName: "Tool Create",
  description:
    "Create, list, delete, and test custom tools. Custom tools are stored in the database and available immediately without restart. Use this to build new capabilities on the fly.",
  category: "system",
  parameters: z.object({
    action: z
      .enum(["create", "list", "delete", "test"])
      .describe("The action to perform"),
    name: z
      .string()
      .optional()
      .describe("Tool name (for create/delete)"),
    display_name: z
      .string()
      .optional()
      .describe("Human-readable display name (for create)"),
    description: z
      .string()
      .optional()
      .describe("Tool description (for create)"),
    parameters_schema: z
      .string()
      .optional()
      .describe(
        'JSON Schema for tool parameters as a JSON string (for create). Example: \'{"type":"object","properties":{"query":{"type":"string","description":"Search query"}},"required":["query"]}\''
      ),
    code: z
      .string()
      .optional()
      .describe(
        'JavaScript code that runs when the tool is called. Has access to `input` (parsed params), `fetch`, `JSON`, `console`. Should return { success: true, output: "result string" }. Can use await.'
      ),
    tool_id: z
      .string()
      .optional()
      .describe("Tool ID (for delete)"),
    test_input: z
      .string()
      .optional()
      .describe("JSON string of test input to pass to the tool (for test)"),
  }),
  execute: async (input: {
    action: string;
    name?: string;
    display_name?: string;
    description?: string;
    parameters_schema?: string;
    code?: string;
    tool_id?: string;
    test_input?: string;
  }) => {
    try {
      switch (input.action) {
        case "create": {
          if (!input.name || !input.description || !input.code) {
            return {
              success: false,
              output:
                "name, description, and code are required to create a tool",
            };
          }

          // Validate parameters schema if provided
          let paramsSchema: any = {
            type: "object",
            properties: {},
          };
          if (input.parameters_schema) {
            try {
              paramsSchema = JSON.parse(input.parameters_schema);
            } catch {
              return {
                success: false,
                output: "parameters_schema is not valid JSON",
              };
            }
          }

          // Check for name collision with builtins
          const existing = db
            .select()
            .from(schema.toolConfigs)
            .where(eq(schema.toolConfigs.name, input.name))
            .all();
          if (existing.length > 0) {
            return {
              success: false,
              output: `A custom tool named "${input.name}" already exists. Delete it first or choose a different name.`,
            };
          }

          // Try to compile the code to catch syntax errors
          try {
            new vm.Script(`(async () => { ${input.code} })()`);
          } catch (err: any) {
            return {
              success: false,
              output: `Code has syntax error: ${err.message}`,
            };
          }

          const id = nanoid();
          const config = {
            description: input.description,
            displayName: input.display_name || input.name,
            parameters: paramsSchema,
            code: input.code,
          };

          db.insert(schema.toolConfigs)
            .values({
              id,
              name: input.name,
              type: "custom",
              enabled: true,
              config: JSON.stringify(config),
            })
            .run();

          logEvolution("tool_created", `Created custom tool: ${input.name}`, {
            tool_id: id,
            name: input.name,
            description: input.description,
          });

          return {
            success: true,
            output: `Created custom tool "${input.name}" (id: ${id}). It will be available in the next message.`,
          };
        }

        case "list": {
          const tools = db
            .select()
            .from(schema.toolConfigs)
            .where(eq(schema.toolConfigs.type, "custom"))
            .all();

          if (tools.length === 0) {
            return {
              success: true,
              output: "No custom tools have been created yet.",
            };
          }

          const list = tools.map((t) => {
            const config = JSON.parse(t.config);
            return `- ${t.name} (${t.id}): ${config.description} [${t.enabled ? "enabled" : "disabled"}]`;
          });

          return {
            success: true,
            output: `Custom tools (${tools.length}):\n${list.join("\n")}`,
          };
        }

        case "delete": {
          const id = input.tool_id || input.name;
          if (!id) {
            return {
              success: false,
              output: "tool_id or name is required to delete a tool",
            };
          }

          // Try by ID first, then by name
          let deleted = db
            .delete(schema.toolConfigs)
            .where(eq(schema.toolConfigs.id, id))
            .run();

          if (deleted.changes === 0) {
            deleted = db
              .delete(schema.toolConfigs)
              .where(eq(schema.toolConfigs.name, id))
              .run();
          }

          if (deleted.changes === 0) {
            return {
              success: false,
              output: `No custom tool found with id or name "${id}"`,
            };
          }

          logEvolution("tool_deleted", `Deleted custom tool: ${id}`);
          return {
            success: true,
            output: `Deleted custom tool "${id}"`,
          };
        }

        case "test": {
          if (!input.name && !input.tool_id && !input.code) {
            return {
              success: false,
              output:
                "Provide name/tool_id to test an existing tool, or code to test inline",
            };
          }

          let code = input.code;

          // Load code from DB if testing an existing tool
          if (!code && (input.name || input.tool_id)) {
            const id = input.tool_id || input.name!;
            const tools = db
              .select()
              .from(schema.toolConfigs)
              .all()
              .filter(
                (t) => t.id === id || t.name === id
              );
            if (tools.length === 0) {
              return {
                success: false,
                output: `Tool "${id}" not found`,
              };
            }
            const config = JSON.parse(tools[0].config);
            code = config.code;
          }

          const testInput = input.test_input
            ? JSON.parse(input.test_input)
            : {};

          const result = await executeCustomTool(code!, testInput);
          return {
            success: result.success,
            output: `Test result: ${result.output}`,
          };
        }

        default:
          return { success: false, output: `Unknown action: ${input.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        output: `Error: ${error.message || "Operation failed"}`,
      };
    }
  },
};
