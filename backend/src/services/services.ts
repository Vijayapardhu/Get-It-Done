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
  image_url?: string | null;
  animation_url?: string | null;
  category_image_url?: string | null;
  category_animation_url?: string | null;
  category_accent_color?: string | null;
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
    imageUrl: row.image_url ?? null,
    animationUrl: row.animation_url ?? null,
    categoryImageUrl: row.category_image_url ?? null,
    categoryAnimationUrl: row.category_animation_url ?? null,
    categoryAccentColor: row.category_accent_color ?? null,
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
        s.id, s.name, s.category, s.description,
        s.base_price          as "base_price",
        s.emergency_supported as "emergency_supported",
        s.created_at          as "created_at",
        s.image_url           as "image_url",
        s.animation_url       as "animation_url",
        c.image_url           as "category_image_url",
        c.animation_url       as "category_animation_url",
        c.accent_color        as "category_accent_color"
      from services s
      left join service_categories c on c.name = s.category
      ${whereClause}
      order by s.category, s.name
    `,
    values
  );

  return result.rows.map(mapServiceRow);
}

export async function getServicesByCategory(): Promise<ServiceCategory[]> {
  const services = await getAllServices();

  // Category artwork in one query rather than one per group.
  const artwork = await pool.query(
    `select name, image_url, animation_url, accent_color from service_categories`
  );
  const byName = new Map<string, { image_url: string | null; animation_url: string | null; accent_color: string | null }>(
    artwork.rows.map((row) => [row.name, row])
  );

  const categories = new Map<string, Service[]>();
  for (const service of services) {
    const existing = categories.get(service.category) ?? [];
    existing.push(service);
    categories.set(service.category, existing);
  }

  return Array.from(categories.entries()).map(([category, services]) => {
    const art = byName.get(category);
    return {
      category,
      services: services.sort((a, b) => a.name.localeCompare(b.name)),
      imageUrl: art?.image_url ?? null,
      animationUrl: art?.animation_url ?? null,
      accentColor: art?.accent_color ?? null,
    };
  });
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

export async function deleteService(id: string): Promise<"deleted" | "not_found" | "in_use"> {
  try {
    const result = await pool.query(
      "delete from services where id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0 ? "deleted" : "not_found";
  } catch (error) {
    if ((error as { code?: string })?.code === "23503") return "in_use";
    throw error;
  }
}