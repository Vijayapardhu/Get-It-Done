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
  list_price?: string | number | null;
  rating_average?: string | number | null;
  rating_count?: string | number | null;
}

/**
 * The catalogue projection, in one place.
 *
 * getServiceById used to carry its own shorter select and had quietly fallen
 * behind: it returned no artwork at all, so every service fetched by id came
 * back with imageUrl null however much artwork was attached to it. Sharing the
 * columns is what stops the list and the detail view disagreeing about what a
 * service is.
 */
const SERVICE_COLUMNS = `
  s.id, s.name, s.category, s.description,
  s.base_price          as "base_price",
  s.emergency_supported as "emergency_supported",
  s.created_at          as "created_at",
  s.image_url           as "image_url",
  s.animation_url       as "animation_url",
  s.list_price          as "list_price",
  c.image_url           as "category_image_url",
  c.animation_url       as "category_animation_url",
  c.accent_color        as "category_accent_color",
  r.rating_average      as "rating_average",
  r.rating_count        as "rating_count"
`;

/**
 * Ratings are reviews of real jobs, reached through the booking that was
 * reviewed. Aggregated in a subquery rather than joined onto the outer query,
 * so a service with fifty reviews still yields one row.
 */
const SERVICE_JOINS = `
  left join service_categories c on c.name = s.category
  left join (
    select b.service_id,
           round(avg(rv.rating)::numeric, 1) as rating_average,
           count(*)                          as rating_count
      from reviews rv
      join bookings b on b.id = rv.booking_id
     group by b.service_id
  ) r on r.service_id = s.id
`;

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
    // Only a real promotion produces a struck-through price. Absent that, the
    // card shows one price and claims no discount.
    listPrice: row.list_price == null ? null : Number(row.list_price),
    ratingAverage: row.rating_average == null ? null : Number(row.rating_average),
    ratingCount: Number(row.rating_count ?? 0),
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
      select ${SERVICE_COLUMNS}
      from services s
      ${SERVICE_JOINS}
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
      select ${SERVICE_COLUMNS}
      from services s
      ${SERVICE_JOINS}
      where s.id = $1
    `,
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapServiceRow(result.rows[0]);
}

export async function createService(input: CreateService): Promise<Service> {
  // RETURNING cannot reach the category and rating joins, so it would hand back
  // a service whose artwork and rating are null purely because of how it was
  // fetched. Read it back through the one projection instead.
  const result = await pool.query<{ id: string }>(
    `
      insert into services (name, category, description, base_price, emergency_supported)
      values ($1, $2, $3, $4, $5)
      returning id
    `,
    [input.name, input.category, input.description ?? null, input.basePrice, input.emergencySupported ?? false]
  );

  const created = await getServiceById(result.rows[0].id);
  if (!created) throw new Error("SERVICE_CREATE_READBACK_FAILED");
  return created;
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

  const result = await pool.query<{ id: string }>(
    `
      update services
      set ${fields.join(", ")}
      where id = $${paramIndex}
      returning id
    `,
    values
  );

  if (result.rowCount === 0) {
    return null;
  }

  return getServiceById(result.rows[0].id);
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