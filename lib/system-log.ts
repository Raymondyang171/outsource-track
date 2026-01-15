import { promises as fs } from "fs";
import path from "path";

type LogLevel = "info" | "warn" | "error";

function getLogDir() {
  return path.join(process.cwd(), "logs");
}

async function ensureLogDir() {
  const dir = getLogDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function appendSystemLog(level: LogLevel, message: string, meta?: Record<string, any>) {
  const dir = await ensureLogDir();
  const timestamp = new Date().toISOString();
  const line = JSON.stringify({
    timestamp,
    level,
    message,
    meta: meta ?? null,
  }) + "\n";
  const filePath = path.join(dir, "system.log");
  await fs.appendFile(filePath, line, "utf8");

  if (level === "error") {
    const errorPath = path.join(dir, "error.log");
    await fs.appendFile(errorPath, line, "utf8");
  }
}
