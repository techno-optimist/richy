import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

const dbPath = path.join(DATA_DIR, "buddy.db");
const sqlite = new Database(dbPath);

// Restrict DB file permissions to owner-only (rw-------)
try {
  fs.chmodSync(dbPath, 0o600);
} catch {
  // May fail on some platforms — non-critical
}
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
