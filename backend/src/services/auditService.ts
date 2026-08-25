import { pool } from "../db/pool.js";

export async function recordAuditEvent(input: {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  await pool.query(
    `insert into audit_events (actor_id, action, resource_type, resource_id, request_id, metadata)
     values ($1, $2, $3, $4, $5, $6)`,
    [input.actorId ?? null, input.action, input.resourceType, input.resourceId ?? null, input.requestId ?? null, input.metadata ?? {}]
  );
}
