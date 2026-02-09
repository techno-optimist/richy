import { z } from "zod/v4";

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
}

export interface RichyToolDef {
  name: string;
  displayName: string;
  description: string;
  category: "web" | "code" | "files" | "memory" | "system" | "custom";
  parameters: z.ZodType<any>;
  execute: (input: any) => Promise<ToolResult>;
}
