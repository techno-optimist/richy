import { z } from "zod/v4";
import vm from "vm";
import type { RichyToolDef } from "../types";

export const codeExecuteTool: RichyToolDef = {
  name: "code_execute",
  displayName: "Code Execute",
  description:
    "Execute JavaScript code in a sandboxed environment. Returns stdout and stderr.",
  category: "code",
  parameters: z.object({
    language: z
      .enum(["javascript", "python"])
      .describe("Programming language (only javascript is supported)"),
    code: z.string().describe("The code to execute"),
  }),
  execute: async (input: { language: string; code: string }) => {
    const timeout = 30000; // 30 seconds

    try {
      if (input.language === "python") {
        return {
          success: false,
          output:
            "Python execution is disabled for security. Use JavaScript instead.",
        };
      }

      if (input.language === "javascript") {
        // Use Node's vm module for sandboxed JS execution
        // Use Object.create(null) to prevent __proto__ escape
        const logs: string[] = [];
        const consoleFns = Object.create(null);
        consoleFns.log = (...args: any[]) =>
          logs.push(args.map(String).join(" "));
        consoleFns.error = (...args: any[]) =>
          logs.push("[ERROR] " + args.map(String).join(" "));
        consoleFns.warn = (...args: any[]) =>
          logs.push("[WARN] " + args.map(String).join(" "));
        Object.freeze(consoleFns);

        const sandbox = Object.create(null);
        sandbox.console = consoleFns;
        sandbox.Math = Math;
        sandbox.JSON = JSON;
        sandbox.Date = Date;
        sandbox.parseInt = parseInt;
        sandbox.parseFloat = parseFloat;
        sandbox.isNaN = isNaN;
        sandbox.isFinite = isFinite;
        sandbox.Array = Array;
        sandbox.Object = Object;
        sandbox.String = String;
        sandbox.Number = Number;
        sandbox.Boolean = Boolean;
        sandbox.Map = Map;
        sandbox.Set = Set;
        sandbox.RegExp = RegExp;
        sandbox.Error = Error;
        sandbox.Promise = Promise;
        // Explicitly block dangerous globals
        sandbox.setTimeout = undefined;
        sandbox.setInterval = undefined;
        sandbox.fetch = undefined;
        sandbox.require = undefined;
        sandbox.process = undefined;
        sandbox.globalThis = undefined;
        sandbox.global = undefined;

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
