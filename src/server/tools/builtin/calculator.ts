import { z } from "zod/v4";
import { evaluate } from "mathjs";
import type { RichyToolDef } from "../types";

export const calculatorTool: RichyToolDef = {
  name: "calculator",
  displayName: "Calculator",
  description:
    "Evaluate mathematical expressions. Supports basic arithmetic, trigonometry, logarithms, and more. Examples: '2 + 3 * 4', 'sqrt(144)', 'sin(pi/4)', '2^10'",
  category: "system",
  parameters: z.object({
    expression: z.string().describe("The mathematical expression to evaluate"),
  }),
  execute: async (input: { expression: string }) => {
    try {
      const result = evaluate(input.expression);
      return {
        success: true,
        output: `${input.expression} = ${result}`,
        data: { result },
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error evaluating expression: ${error.message}`,
      };
    }
  },
};
