import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import logger from "./logger.js";

export const s3Client = new S3Client({
  region: env.S3_REGION ?? "us-east-1",
  endpoint: env.S3_ENDPOINT,
  credentials: { accessKeyId: env.S3_ACCESS_KEY ?? "", secretAccessKey: env.S3_SECRET_KEY ?? "" },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export const BUCKET = env.S3_BUCKET ?? "getitdone";
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  spreadsheet: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

function getAllowedMimeTypes(type: string): string[] {
  switch (type) {
    case "avatar":
    case "photo": return ALLOWED_TYPES.image;
    case "document":
    case "certificate":
    case "id_proof": return [...ALLOWED_TYPES.document, ...ALLOWED_TYPES.image];
    default: return [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.document, ...ALLOWED_TYPES.spreadsheet];
  }
}

const isS3Compatible = env.STORAGE_PROVIDER === "s3" || env.STORAGE_PROVIDER === "minio";

function generateFileKey(userId: string, type: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const hash = crypto.randomBytes(16).toString("hex");
  return `private/${type}/${userId}/${hash}.${ext}`;
}

export async function getUploadUrl(userId: string, type: string, filename: string, contentType: string): Promise<{ uploadUrl: string; fileKey: string; expiresIn: number }> {
  const allowedTypes = getAllowedMimeTypes(type);
  if (!allowedTypes.includes(contentType)) {
    throw new Error(`FILE_TYPE_NOT_ALLOWED: ${contentType} not allowed for ${type}`);
  }

  const fileKey = generateFileKey(userId, type, filename);
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: fileKey, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return { uploadUrl, fileKey, expiresIn: 3600 };
}

/**
 * Upload bytes the server itself generated (report exports, invoice PDFs).
 *
 * Every other helper here issues a presigned URL for a *client* to upload
 * through, which is no use for a file that only exists inside a background job.
 */
export async function putObject(
  fileKey: string,
  body: Buffer | string,
  contentType: string
): Promise<{ fileKey: string; fileUrl: string; size: number }> {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8");
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`FILE_TOO_LARGE: ${buffer.byteLength} bytes exceeds ${MAX_FILE_SIZE}`);
  }

  await s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: fileKey, Body: buffer, ContentType: contentType })
  );

  return { fileKey, fileUrl: `${env.S3_ENDPOINT}/${BUCKET}/${fileKey}`, size: buffer.byteLength };
}

/** Deterministic key for a generated artefact, scoped by kind and owner. */
export function generatedFileKey(kind: string, ownerId: string, filename: string): string {
  return `private/generated/${kind}/${ownerId}/${filename}`;
}

export async function completeUpload(fileKey: string): Promise<{ fileKey: string; fileUrl: string }> {
  const headCommand = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
  await s3Client.send(headCommand);
  const fileUrl = `${env.S3_ENDPOINT}/${BUCKET}/${fileKey}`;
  return { fileKey, fileUrl };
}

export async function getDownloadUrl(fileKey: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteFile(fileKey: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: fileKey });
  await s3Client.send(command);
}

export async function scanForMalware(fileKey: string): Promise<{ clean: boolean; details?: string }> {
  if (!env.MALWARE_SCAN_API) {
    logger.warn("Malware scan API not configured, skipping scan");
    return { clean: true, details: "scan_skipped" };
  }
  try {
    const downloadUrl = await getDownloadUrl(fileKey, 300);
    const response = await fetch(env.MALWARE_SCAN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: downloadUrl }),
    });
    const result = await response.json();
    return { clean: result.clean === true, details: result.details };
  } catch (error) {
    logger.error({ err: error, fileKey }, "Malware scan failed");
    return { clean: false, details: "scan_failed" };
  }
}

export { MAX_FILE_SIZE, isS3Compatible };