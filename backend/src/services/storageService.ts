import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".pdf"]);
const maxBytes = 10 * 1024 * 1024;

export async function savePrivateWorkerDocument(userId: string, filename: string, base64: string) {
  const extension = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error("UNSUPPORTED_DOCUMENT_TYPE");
  const encoded = base64.replace(/^data:[^;]+;base64,/, "");
  const content = Buffer.from(encoded, "base64");
  if (content.length === 0 || content.length > maxBytes) throw new Error("DOCUMENT_SIZE_INVALID");
  const key = path.posix.join("workers", userId, `${crypto.randomUUID()}${extension}`);
  const target = path.resolve(env.STORAGE_DIR, key);
  if (!target.startsWith(path.resolve(env.STORAGE_DIR) + path.sep)) throw new Error("INVALID_STORAGE_KEY");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, content, { mode: 0o600, flag: "wx" });
  return key;
}
