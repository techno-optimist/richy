import { z } from "zod/v4";
import { execSync } from "child_process";
import vm from "vm";
import type { RichyToolDef } from "../types";

export const codeExecuteTool: RichyToolDef = {
  name: "code_execute",
  displayName: "Code Execute",
  description:
    "Execute code in a sandboxed environment. Supports JavaScript and Python (if installed). Returns stdout and stderr.",
  category: "code",
  parameters: z.object({
    language: z
      .enum(["javascript", "python"])
      .describe("Programming language"),
    code: z.string().describe("The code to execute"),
  }),
  execute: async (input: { language: string; code: string }) => {
    const timeout = 30000; // 30 seconds

    try {
      if (input.language === "javascript") {
        // Use Node's vm module for sandboxed JS execution
        const logs: string[] = [];
        const sandbox = {
          console: {
            log: (...args: any[]) =>
              logs.push(args.map(String).join(" ")),
            error: (...args: any[]) =>
              logs.push("[ERROR] " + args.map(String).join(" ")),
            warn: (...args: any[]) =>
              logs.push("[WARN] " + args.map(String).join(" ")),
          },
          Math,
          JSON,
          Date,
          parseInt,
          parseFloat,
          isNaN,
          isFinite,
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
          setTimeout: undefined,
          setInterval: undefined,
          fetch: undefined,
          require: undefined,
          process: undefined,
        };

        const context = vm.createContext(sandbox);
        const script = new vm.Script(input.code);
        const result = script.runInContext(context, { timeout });

        const output = logs.length > 0 ? logs.join("\n") : String(result);

        return {
          success: true,
          output: output || "(no output)",
          data: { result: String(result) },
        };
      }

      if (input.language === "python") {
        const result = execSync(`python3 -c ${JSON.stringify(input.code)}`, {
          timeout,
          maxBuffer: 1024 * 1024,
          encoding: "utf-8",
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        });

        return {
          success: true,
          output: result || "(no output)",
        };
      }

      return {
        success: false,
        output: `Unsupported language: ${input.language}`,
      };
    } catch (error: any) {
      const message =
        error.stderr || error.message || "Execution failed";
      return {
        success: false,
        output: `Error: ${message}`,
      };
    }
  },
};
