import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * Public artwork for services and categories.
 *
 * Deliberately a separate store from `storageService`, which holds worker
 * identity documents at mode 0600. These files are the opposite: they are
 * served unauthenticated to every app on the network, so they live under their
 * own `public/` prefix and can never be confused with a private upload.
 */

const PUBLIC_PREFIX = "public/artwork";

/** Served at this path — see the static mount in app.ts. */
export const ARTWORK_URL_PREFIX = "/media/artwork";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_ANIMATION_BYTES = 1 * 1024 * 1024;

/**
 * Content sniffing, not extension trust.
 *
 * The filename comes from the caller. Serving an attacker-supplied file from
 * our own origin because it was named `.png` is how a stored-XSS lands, so the
 * bytes have to actually be the format they claim.
 */
function detectImageType(content: Buffer): ".png" | ".jpg" | ".webp" | null {
  if (content.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47 &&
    content[4] === 0x0d && content[5] === 0x0a && content[6] === 0x1a && content[7] === 0x0a
  ) {
    return ".png";
  }

  // JPEG: FF D8 FF
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return ".jpg";

  // WebP: "RIFF" .... "WEBP"
  if (content.toString("ascii", 0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP") {
    return ".webp";
  }

  return null;
}

function decodeBase64(base64: string): Buffer {
  return Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
}

export async function saveArtworkImage(base64: string): Promise<string> {
  const content = decodeBase64(base64);
  if (content.length === 0) throw new Error("ARTWORK_EMPTY");
  if (content.length > MAX_IMAGE_BYTES) throw new Error("ARTWORK_TOO_LARGE");

  const extension = detectImageType(content);
  if (!extension) throw new Error("ARTWORK_UNSUPPORTED_TYPE");

  return write(`${crypto.randomUUID()}${extension}`, content);
}

/**
 * A Lottie file is JSON, so "is it really a Lottie" is a parse, not a magic
 * number. Requiring the structural fields keeps arbitrary JSON — or a JSON
 * bomb — from being served as an animation.
 */
export async function saveArtworkAnimation(base64OrJson: string): Promise<string> {
  const content = base64OrJson.trimStart().startsWith("{")
    ? Buffer.from(base64OrJson, "utf-8")
    : decodeBase64(base64OrJson);

  if (content.length === 0) throw new Error("ARTWORK_EMPTY");
  if (content.length > MAX_ANIMATION_BYTES) throw new Error("ARTWORK_TOO_LARGE");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString("utf-8"));
  } catch {
    throw new Error("ARTWORK_NOT_JSON");
  }

  const lottie = parsed as Record<string, unknown>;
  // `v` (version), `w`/`h` (dimensions) and `layers` are present in every
  // Bodymovin export; without them the player renders nothing.
  const looksLikeLottie =
    typeof lottie?.v === "string" &&
    typeof lottie?.w === "number" &&
    typeof lottie?.h === "number" &&
    Array.isArray(lottie?.layers);
  if (!looksLikeLottie) throw new Error("ARTWORK_NOT_LOTTIE");

  return write(`${crypto.randomUUID()}.json`, content);
}

async function write(filename: string, content: Buffer): Promise<string> {
  const key = path.posix.join(PUBLIC_PREFIX, filename);
  const target = path.resolve(env.STORAGE_DIR, key);

  // Path traversal guard. `filename` is generated here rather than supplied,
  // but the check costs nothing and survives someone changing that later.
  if (!target.startsWith(path.resolve(env.STORAGE_DIR) + path.sep)) {
    throw new Error("INVALID_STORAGE_KEY");
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" });

  return `${ARTWORK_URL_PREFIX}/${filename}`;
}

/**
 * Accept an artwork reference that is already hosted elsewhere.
 *
 * Only https and our own relative media path. An http:// URL would be blocked
 * by the app's transport security anyway, and allowing arbitrary schemes here
 * would let `javascript:` reach a WebView.
 */
export function normaliseArtworkUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith(`${ARTWORK_URL_PREFIX}/`)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("ARTWORK_INVALID_URL");
  }
  if (parsed.protocol !== "https:") throw new Error("ARTWORK_INSECURE_URL");

  return parsed.toString();
}
