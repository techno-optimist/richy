import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST() {
  try {
    await execFileAsync("open", [
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    ]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
