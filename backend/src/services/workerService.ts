import { v4 as uuidv4 } from "uuid";
import { pool } from "../db/pool.js";

const workerSelect = `
  select w.id, w.user_id as "userId", w.cooperative_id as "cooperativeId",
    w.experience_years as "experienceYears", w.verification_status as "verificationStatus",
    w.rating, w.current_status as "currentStatus", w.address,
    w.profile_photo_url as "profilePhotoUrl", w.location_sharing_enabled as "locationSharingEnabled",
    w.location_updated_at as "locationUpdatedAt", u.name, u.phone, u.email, u.language,
    c.name as "cooperativeName", c.district, c.state
  from workers w
  join users u on u.id = w.user_id
  left join cooperatives c on c.id = w.cooperative_id`;

export async function getWorkerByUserId(userId: string) {
  const result = await pool.query(`${workerSelect} where w.user_id = $1`, [userId]);
  return result.rows[0] ?? null;
}

export async function updateWorkerProfile(userId: string, input: { address?: string; profilePhotoUrl?: string; experienceYears?: number }) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  for (const [column, value] of [["address", input.address], ["profile_photo_url", input.profilePhotoUrl], ["experience_years", input.experienceYears]] as const) {
    if (value !== undefined) { fields.push(`${column} = $${index++}`); values.push(value); }
  }
  if (fields.length === 0) return getWorkerByUserId(userId);
  values.push(userId);
  const result = await pool.query(`update workers set ${fields.join(", ")}, updated_at = now() where user_id = $${index} returning id`, values);
  return result.rowCount ? getWorkerByUserId(userId) : null;
}

export async function replaceWorkerSkills(userId: string, skills: Array<{ serviceId: string; certificationLevel?: string }>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const worker = await client.query("select id from workers where user_id = $1 for update", [userId]);
    if (!worker.rows[0]) { await client.query("rollback"); return null; }
    await client.query("delete from worker_skills where worker_id = $1", [worker.rows[0].id]);
    for (const skill of skills) {
      await client.query("insert into worker_skills (worker_id, service_id, certification_level) values ($1, $2, $3)", [worker.rows[0].id, skill.serviceId, skill.certificationLevel ?? null]);
    }
    await client.query("commit");
    return getWorkerSkills(worker.rows[0].id);
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getWorkerSkills(workerId: string) {
  const result = await pool.query(`select ws.service_id as "serviceId", s.name, s.category, ws.certification_level as "certificationLevel" from worker_skills ws join services s on s.id = ws.service_id where ws.worker_id = $1 order by s.category, s.name`, [workerId]);
  return result.rows;
}

export async function updateAvailability(userId: string, status: "available" | "busy" | "offline") {
  const result = await pool.query(`update workers set current_status = $1, updated_at = now() where user_id = $2 and verification_status = 'verified' returning id, current_status as "currentStatus", updated_at as "updatedAt"`, [status, userId]);
  return result.rows[0] ?? null;
}

export async function updateWorkerLocation(userId: string, latitude: number, longitude: number, sharingEnabled: boolean) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const worker = await client.query("update workers set location_sharing_enabled = $1, location_updated_at = now(), updated_at = now() where user_id = $2 returning id", [sharingEnabled, userId]);
    if (!worker.rows[0]) { await client.query("rollback"); return null; }
    if (sharingEnabled) {
      await client.query("insert into worker_locations (worker_id, location, updated_at) values ($1, st_setsrid(st_makepoint($2, $3), 4326)::geography, now()) on conflict (worker_id) do update set location = excluded.location, updated_at = now()", [worker.rows[0].id, longitude, latitude]);
    } else {
      await client.query("delete from worker_locations where worker_id = $1", [worker.rows[0].id]);
    }
    await client.query("commit");
    return { workerId: worker.rows[0].id, sharingEnabled };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function addWorkerDocument(userId: string, type: string, fileUrl: string) {
  const result = await pool.query(`insert into worker_documents (worker_id, type, file_url) select id, $1, $2 from workers where user_id = $3 returning id, type, file_url as "fileUrl", status, created_at as "createdAt"`, [type, fileUrl, userId]);
  return result.rows[0] ?? null;
}

export async function getWorkerWelfare(userId: string) {
  const result = await pool.query(`select wr.worker_id as "workerId", wr.insurance_status as "insuranceStatus", wr.training_status as "trainingStatus", wr.notes, wr.updated_at as "updatedAt" from welfare_records wr join workers w on w.id = wr.worker_id where w.user_id = $1`, [userId]);
  return result.rows[0] ?? null;
}

export async function verifyWorker(workerId: string, actorId: string, status: "under_review" | "verified" | "rejected" | "suspended" | "expired", reason?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query("select verification_status from workers where id = $1 for update", [workerId]);
    if (!current.rows[0]) { await client.query("rollback"); return null; }
    const result = await client.query("update workers set verification_status = $1, current_status = case when $1 <> 'verified' then 'offline' else current_status end, updated_at = now() where id = $2 returning id, verification_status as \"verificationStatus\", current_status as \"currentStatus\"", [status, workerId]);
    await client.query("insert into worker_verification_events (id, worker_id, actor_id, from_status, to_status, reason) values ($1, $2, $3, $4, $5, $6)", [uuidv4(), workerId, actorId, current.rows[0].verification_status, status, reason ?? null]);
    await client.query("commit");
    return result.rows[0];
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function createWorkerProfile(userId: string, input: { cooperativeId?: string; address?: string; experienceYears?: number }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(`insert into workers (user_id, address, experience_years) values ($1, $2, $3) on conflict (user_id) do update set updated_at = now() returning id`, [userId, input.address ?? null, input.experienceYears ?? 0]);
    await client.query("insert into welfare_records (worker_id) values ($1) on conflict (worker_id) do nothing", [result.rows[0].id]);
    await client.query("commit");
    return getWorkerByUserId(userId);
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function replaceWorkerServiceAreas(userId: string, areas: Array<{ serviceId: string; radiusKm: number }>) {
  const worker = await pool.query("select id from workers where user_id = $1", [userId]);
  if (!worker.rows[0]) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from worker_service_areas where worker_id = $1", [worker.rows[0].id]);
    for (const area of areas) await client.query("insert into worker_service_areas (worker_id, service_id, radius_km) values ($1, $2, $3)", [worker.rows[0].id, area.serviceId, area.radiusKm]);
    await client.query("commit");
    return getWorkerServiceAreas(worker.rows[0].id);
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function getWorkerServiceAreas(workerId: string) {
  const result = await pool.query(`select wsa.service_id as "serviceId", s.name, wsa.radius_km as "radiusKm" from worker_service_areas wsa join services s on s.id = wsa.service_id where wsa.worker_id = $1 order by s.name`, [workerId]);
  return result.rows;
}