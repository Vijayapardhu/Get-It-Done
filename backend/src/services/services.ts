import { pool } from "../db/pool.js";
import type { Service, ServiceCategory, CreateService, UpdateService, ServiceListParams } from "../types/services.js";

interface ServiceRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  base_price: string | number;
  emergency_supported: boolean;
  created_at: string;
}

function mapServiceRow(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    basePrice: Number(row.base_price),
    emergencySupported: row.emergency_supported,
    createdAt: row.created_at,
  };
}

export async function getAllServices(params: ServiceListParams = {}): Promise<Service[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.category) {
    conditions.push(`category = $${paramIndex++}`);
    values.push(params.category);
  }

  if (params.emergencyOnly) {
    conditions.push(`emergency_supported = true`);
  }

  if (params.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    values.push(`%${params.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<ServiceRow>(
    `
      select
        id, name, category, description,
        base_price as "base_price",
        emergency_supported as "emergency_supported",
        created_at as "created_at"
      from services
      ${whereClause}
      order by category, name
    `,
    values
  );

  return result.rows.map(mapServiceRow);
}

export async function getServicesByCategory(): Promise<ServiceCategory[]> {
  const services = await getAllServices();

  const categories = new Map<string, Service[]>();
  for (const service of services) {
    const existing = categories.get(service.category) ?? [];
    existing.push(service);
    categories.set(service.category, existing);
  }

  return Array.from(categories.entries()).map(([category, services]) => ({
    category,
    services: services.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export async function getServiceById(id: string): Promise<Service | null> {
  const result = await pool.query<ServiceRow>(
    `
      select
        id, name, category, description,
        base_price as "base_price",
        emergency_supported as "emergency_supported",
        created_at as "created_at"
      from services
      where id = $1
    `,
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapServiceRow(result.rows[0]);
}

export async function createService(input: CreateService): Promise<Service> {
  const result = await pool.query<ServiceRow>(
    `
      insert into services (name, category, description, base_price, emergency_supported)
      values ($1, $2, $3, $4, $5)
      returning
        id, name, category, description,
        base_price as "base_price",
        emergency_supported as "emergency_supported",
        created_at as "created_at"
    `,
    [input.name, input.category, input.description ?? null, input.basePrice, input.emergencySupported ?? false]
  );

  return mapServiceRow(result.rows[0]);
}

export async function updateService(id: string, input: UpdateService): Promise<Service | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.category !== undefined) {
    fields.push(`category = $${paramIndex++}`);
    values.push(input.category);
  }
  if (input.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.basePrice !== undefined) {
    fields.push(`base_price = $${paramIndex++}`);
    values.push(input.basePrice);
  }
  if (input.emergencySupported !== undefined) {
    fields.push(`emergency_supported = $${paramIndex++}`);
    values.push(input.emergencySupported);
  }

  if (fields.length === 0) {
    return getServiceById(id);
  }

  values.push(id);

  const result = await pool.query<ServiceRow>(
    `
      update services
      set ${fields.join(", ")}
      where id = $${paramIndex}
      returning
        id, name, category, description,
        base_price as "base_price",
        emergency_supported as "emergency_supported",
        created_at as "created_at"
    `,
    values
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapServiceRow(result.rows[0]);
}

export async function deleteService(id: string): Promise<boolean> {
  const result = await pool.query(
    "delete from services where id = $1",
    [id]
  );

  return (result.rowCount ?? 0) > 0;
}