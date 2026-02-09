import { z } from "zod/v4";
import { execSync, execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, relative, resolve } from "path";
import { nanoid } from "nanoid";
import { db, schema } from "../../db";
import type { RichyToolDef } from "../types";

const PROJECT_ROOT = process.cwd();

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

function resolvePath(filePath: string): string {
  const resolved = resolve(PROJECT_ROOT, filePath);
  if (!resolved.startsWith(PROJECT_ROOT + "/")) {
    throw new Error("Path must be within the project directory");
  }
  return resolved;
}

/** Recursively list files matching a name pattern, without shell interpolation. */
function listFilesRecursive(
  dir: string,
  namePattern: string,
  results: string[] = [],
  depth: number = 0
): string[] {
  if (depth > 10 || results.length >= 100) return results;
  const SKIP = new Set(["node_modules", ".next", ".git"]);
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        listFilesRecursive(fullPath, namePattern, results, depth + 1);
      } else if (
        namePattern === "*" ||
        entry.name.endsWith(namePattern.replace("*", "")) ||
        entry.name.match(new RegExp("^" + namePattern.replace(/\*/g, ".*") + "$"))
      ) {
        results.push(relative(PROJECT_ROOT, fullPath));
      }
    }
  } catch {
    // Permission denied or other FS error
  }
  return results;
}

/** Filter sensitive keys from process.env for child processes */
function getSafeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const sensitiveKeys = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "API_KEY", "SECRET",
    "TOKEN", "PASSWORD", "CREDENTIAL",
  ];
  for (const key of Object.keys(env)) {
    if (sensitiveKeys.some((s) => key.toUpperCase().includes(s))) {
      delete env[key];
    }
  }
  return env;
}

export const selfModifyTool: RichyToolDef = {
  name: "self_modify",
  displayName: "Self Modify",
  description:
    "Read, write, and edit files in the Richy project codebase. Run shell commands. Use this for deep modifications like adding new TypeScript tools, editing the system prompt, or installing packages.",
  category: "system",
  parameters: z.object({
    action: z
      .enum(["read_file", "write_file", "edit_file", "list_files", "run_command"])
      .describe("The action to perform"),
    path: z
      .string()
      .optional()
      .describe("File path relative to project root (for file operations)"),
    content: z
      .string()
      .optional()
      .describe("File content (for write_file) or new string (for edit_file)"),
    old_string: z
      .string()
      .optional()
      .describe("String to find (for edit_file)"),
    new_string: z
      .string()
      .optional()
      .describe("Replacement string (for edit_file)"),
    pattern: z
      .string()
      .optional()
      .describe("Glob pattern (for list_files, e.g. 'src/**/*.ts')"),
    command: z
      .string()
      .optional()
      .describe("Shell command to run (for run_command)"),
    description: z
      .string()
      .optional()
      .describe("Why you are making this change (logged to evolution history)"),
  }),
  execute: async (input: {
    action: string;
    path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    pattern?: string;
    command?: string;
    description?: string;
  }) => {
    try {
      switch (input.action) {
        case "read_file": {
          if (!input.path) {
            return { success: false, output: "path is required for read_file" };
          }
          const fullPath = resolvePath(input.path);
          try {
            const content = readFileSync(fullPath, "utf-8");
            return {
              success: true,
              output: content,
              data: { path: input.path, size: content.length },
            };
          } catch (err: any) {
            return { success: false, output: `Cannot read ${input.path}: ${err.code || err.message}` };
          }
        }

        case "write_file": {
          if (!input.path || input.content === undefined) {
            return {
              success: false,
              output: "path and content are required for write_file",
            };
          }
          const fullPath = resolvePath(input.path);
          const dir = dirname(fullPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          const isNew = !existsSync(fullPath);
          writeFileSync(fullPath, input.content, "utf-8");
          logEvolution(
            isNew ? "file_created" : "file_modified",
            input.description || `${isNew ? "Created" : "Modified"} ${input.path}`,
            { path: input.path, size: input.content.length }
          );
          return {
            success: true,
            output: `${isNew ? "Created" : "Updated"} ${input.path} (${input.content.length} bytes)`,
          };
        }

        case "edit_file": {
          if (!input.path || !input.old_string || input.new_string === undefined) {
            return {
              success: false,
              output: "path, old_string, and new_string are required for edit_file",
            };
          }
          const fullPath = resolvePath(input.path);
          if (!existsSync(fullPath)) {
            return { success: false, output: `File not found: ${input.path}` };
          }
          const existing = readFileSync(fullPath, "utf-8");
          if (!existing.includes(input.old_string)) {
            return {
              success: false,
              output: `old_string not found in ${input.path}`,
            };
          }
          const updated = existing.replace(input.old_string, input.new_string);
          writeFileSync(fullPath, updated, "utf-8");
          logEvolution(
            "file_modified",
            input.description || `Edited ${input.path}`,
            {
              path: input.path,
              old_string_preview: input.old_string.substring(0, 100),
              new_string_preview: input.new_string.substring(0, 100),
            }
          );
          return {
            success: true,
            output: `Edited ${input.path}: replaced string successfully`,
          };
        }

        case "list_files": {
          const pattern = input.pattern || "*.ts";
          const namePattern = pattern.split("/").pop() || "*.ts";
          const subdir = pattern.includes("/")
            ? pattern.substring(0, pattern.lastIndexOf("/"))
            : ".";
          const searchDir = resolvePath(subdir);
          const files = listFilesRecursive(searchDir, namePattern);
          return {
            success: true,
            output: files.length > 0 ? files.join("\n") : "(no files found)",
            data: { count: files.length },
          };
        }

        case "run_command": {
          if (!input.command) {
            return {
              success: false,
              output: "command is required for run_command",
            };
          }
          const result = execSync(input.command, {
            cwd: PROJECT_ROOT,
            encoding: "utf-8",
            timeout: 60000,
            maxBuffer: 1024 * 1024,
            env: getSafeEnv(),
          });
          logEvolution(
            "command_run",
            input.description || `Ran: ${input.command.substring(0, 100)}`,
            { command: input.command, output_preview: result.substring(0, 500) }
          );
          return {
            success: true,
            output: result || "(no output)",
          };
        }

        default:
          return { success: false, output: `Unknown action: ${input.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        output: `Error: ${error.stderr || error.message || "Operation failed"}`,
      };
    }
  },
};
