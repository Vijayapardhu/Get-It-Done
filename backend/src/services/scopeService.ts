import { pool } from "../db/pool.js";

export async function canAdminAccessWorker(userId: string, role: string, workerId: string) {
  if (role === "system_admin") return true;
  const result = await pool.query(`select 1 from workers w left join admin_scopes s on s.user_id = $1 left join cooperatives c on c.id = w.cooperative_id where w.id = $2 and ((s.cooperative_id = w.cooperative_id and $3 = 'society_admin') or (s.federation_id = c.federation_id and $3 = 'federation_admin'))`, [userId, workerId, role]);
  return Boolean(result.rows[0]);
}