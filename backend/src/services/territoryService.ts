import { pool } from "../db/pool.js";

export interface Point {
  lat: number;
  lng: number;
}

export interface Polygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface TerritoryPreview {
  bookingCount: number;
  workerCount: number;
  activeWorkerCount: number;
  customerCount: number;
  areaKm2: number;
}

export interface TerritoryConflict {
  territoryId: string;
  cooperativeId: string;
  cooperativeName: string;
  intersectionAreaKm2: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const territoryService = {
  async createTerritory(data: {
    cooperativeId: string;
    polygon: Polygon;
    status?: string;
    createdBy: string;
  }) {
    const { cooperativeId, polygon, status = "draft", createdBy } = data;

    const geoJson = JSON.stringify(polygon);
    const result = await pool.query(
      `INSERT INTO cooperative_territories (cooperative_id, polygon, status, created_by, updated_by)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)::geography, $3, $4, $4)
       RETURNING id, cooperative_id, status, version,
                 ST_AsGeoJSON(polygon::geometry)::jsonb as geometry,
                 area_km2, center_lat, center_lng,
                 created_at, updated_at`,
      [cooperativeId, geoJson, status, createdBy]
    );

    return result.rows[0];
  },

  async getTerritoryByCooperative(cooperativeId: string) {
    const result = await pool.query(
      `SELECT id, cooperative_id, status, version,
              ST_AsGeoJSON(polygon::geometry)::jsonb as geometry,
              area_km2, center_lat, center_lng,
              created_at, updated_at, validated_at
       FROM cooperative_territories
       WHERE cooperative_id = $1 AND status = 'active'
       ORDER BY version DESC
       LIMIT 1`,
      [cooperativeId]
    );
    return result.rows[0] || null;
  },

  async updateTerritory(territoryId: string, data: {
    polygon?: Polygon;
    status?: string;
    updatedBy: string;
  }) {
    const { polygon, status, updatedBy } = data;
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (polygon) {
      fields.push(`polygon = ST_SetSRID(ST_GeomFromGeoJSON($${index++}), 4326)::geography`);
      values.push(JSON.stringify(polygon));
      fields.push(`version = version + 1`);
    }
    if (status) {
      fields.push(`status = $${index++}`);
      values.push(status);
      if (status === "active") {
        fields.push(`validated_at = now()`);
      }
    }
    fields.push(`updated_by = $${index++}`);
    values.push(updatedBy);
    values.push(territoryId);

    const result = await pool.query(
      `UPDATE cooperative_territories
       SET ${fields.join(", ")}, updated_at = now()
       WHERE id = $${index}
       RETURNING id, cooperative_id, status, version,
                 ST_AsGeoJSON(polygon::geometry)::jsonb as geometry,
                 area_km2, center_lat, center_lng,
                 created_at, updated_at, validated_at`,
      values
    );
    return result.rows[0] || null;
  },

  async deleteTerritory(territoryId: string, userId: string) {
    const result = await pool.query(
      `UPDATE cooperative_territories SET status = 'inactive', updated_by = $2, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [territoryId, userId]
    );
    return Boolean(result.rows[0]);
  },

  async validatePolygon(polygon: Polygon): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!polygon || polygon.type !== "Polygon") {
      errors.push("Invalid polygon type");
      return { valid: false, errors, warnings };
    }

    const coords = polygon.coordinates[0];
    if (!coords || coords.length < 4) {
      errors.push("Polygon must have at least 4 points (including closing point)");
      return { valid: false, errors, warnings };
    }

    const geoJson = JSON.stringify(polygon);
    const validityCheck = await pool.query(
      `SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) as is_valid,
              ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) as reason`,
      [geoJson]
    );

    if (!validityCheck.rows[0]?.is_valid) {
      errors.push(`Invalid geometry: ${validityCheck.rows[0]?.reason || "unknown error"}`);
    }

    const areaCheck = await pool.query(
      `SELECT ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) / 1000000 as area_km2`,
      [geoJson]
    );
    const areaKm2 = areaCheck.rows[0]?.area_km2 || 0;
    if (areaKm2 < 0.01) {
      errors.push("Territory area is too small (minimum 0.01 km²)");
    }
    if (areaKm2 > 10000) {
      warnings.push("Territory area is very large. Please verify this is correct.");
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  async checkConflicts(polygon: Polygon, federationId: string, excludeCooperativeId?: string): Promise<TerritoryConflict[]> {
    const geoJson = JSON.stringify(polygon);
    const values: unknown[] = [geoJson, federationId];
    let query = `
      SELECT ct.id as territory_id, ct.cooperative_id, c.name as cooperative_name,
             ST_Area(ST_Intersection(ct.polygon, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography)::geography) / 1000000 as intersection_area_km2
      FROM cooperative_territories ct
      JOIN cooperatives c ON c.id = ct.cooperative_id
      WHERE ct.status = 'active'
        AND c.federation_id = $2
        AND ST_Intersects(ct.polygon, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography)
    `;
    if (excludeCooperativeId) {
      query += ` AND ct.cooperative_id != $3`;
      values.push(excludeCooperativeId);
    }
    query += ` ORDER BY intersection_area_km2 DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  },

  async getTerritoryPreview(polygon: Polygon): Promise<TerritoryPreview> {
    const geoJson = JSON.stringify(polygon);

    const bookings = await pool.query(
      `SELECT count(*)::int as count FROM bookings
       WHERE ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography, location::geography)`,
      [geoJson]
    );

    const workers = await pool.query(
      `SELECT count(DISTINCT w.id)::int as count,
              count(DISTINCT w.id) filter (where w.current_status = 'available')::int as active
       FROM workers w
       JOIN worker_locations wl ON wl.worker_id = w.id
       WHERE ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography, wl.location::geography)`,
      [geoJson]
    );

    const customers = await pool.query(
      `SELECT count(DISTINCT b.customer_id)::int as count
       FROM bookings b
       WHERE ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography, b.location::geography)`,
      [geoJson]
    );

    const area = await pool.query(
      `SELECT ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) / 1000000 as area_km2`,
      [geoJson]
    );

    return {
      bookingCount: bookings.rows[0]?.count || 0,
      workerCount: workers.rows[0]?.count || 0,
      activeWorkerCount: workers.rows[0]?.active || 0,
      customerCount: customers.rows[0]?.count || 0,
      areaKm2: Math.round((area.rows[0]?.area_km2 || 0) * 100) / 100,
    };
  },

  async resolveSocietyByCoordinates(lat: number, lng: number) {
    const result = await pool.query(
      `SELECT ct.id as territory_id, ct.cooperative_id, ct.version,
              c.name as cooperative_name, c.federation_id
       FROM cooperative_territories ct
       JOIN cooperatives c ON c.id = ct.cooperative_id
       WHERE ct.status = 'active'
         AND ST_Contains(ct.polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
       LIMIT 1`,
      [lng, lat]
    );
    return result.rows[0] || null;
  },

  async getTerritoryStatistics(cooperativeId: string) {
    const territory = await this.getTerritoryByCooperative(cooperativeId);
    if (!territory) return null;

    const geoJson = territory.geometry;
    const bookings = await pool.query(
      `SELECT count(*)::int as total,
              count(*) filter (where status = 'completed')::int as completed,
              count(*) filter (where status in ('requested', 'matching', 'assigned'))::int as active
       FROM bookings WHERE cooperative_id = $1`,
      [cooperativeId]
    );

    const workers = await pool.query(
      `SELECT count(*)::int as total,
              count(*) filter (where current_status = 'available')::int as available,
              count(*) filter (where verification_status = 'verified')::int as verified
       FROM workers WHERE cooperative_id = $1`,
      [cooperativeId]
    );

    return {
      territory,
      bookings: bookings.rows[0],
      workers: workers.rows[0],
    };
  },

  async getFederationTerritories(federationId: string) {
    const result = await pool.query(
      `SELECT ct.id, ct.cooperative_id, ct.status, ct.version,
              ST_AsGeoJSON(ct.polygon::geometry)::jsonb as geometry,
              ct.area_km2, ct.center_lat, ct.center_lng,
              c.name as cooperative_name
       FROM cooperative_territories ct
       JOIN cooperatives c ON c.id = ct.cooperative_id
       WHERE c.federation_id = $1 AND ct.status = 'active'
       ORDER BY c.name`,
      [federationId]
    );
    return result.rows;
  },

  async backfillBookingCooperative(bookingId: string) {
    const result = await pool.query(
      `UPDATE bookings b
       SET cooperative_id = sub.cooperative_id, territory_id = sub.territory_id
       FROM (
         SELECT b.id, ct.cooperative_id, ct.id as territory_id
         FROM bookings b
         JOIN cooperative_territories ct ON ct.status = 'active'
           AND ST_Contains(ct.polygon, b.location::geography)
         WHERE b.id = $1 AND b.cooperative_id IS NULL
         LIMIT 1
       ) sub
       WHERE b.id = sub.id
       RETURNING b.id, b.cooperative_id`,
      [bookingId]
    );
    return result.rows[0] || null;
  },

  async resolveAndAssignBooking(bookingId: string, latitude: number, longitude: number) {
    const territory = await this.resolveSocietyByCoordinates(latitude, longitude);
    if (territory) {
      await pool.query(
        `UPDATE bookings SET cooperative_id = $1, territory_id = $2, territory_version = $3 WHERE id = $4`,
        [territory.cooperative_id, territory.territory_id, territory.version, bookingId]
      );
      return { assigned: true, cooperativeId: territory.cooperative_id, territoryId: territory.territory_id };
    }
    return { assigned: false, cooperativeId: null, territoryId: null };
  },

  async getUnassignedBookings(federationId?: string) {
    const conditions = [`b.cooperative_id IS NULL`, `b.location IS NOT NULL`];
    const values: unknown[] = [];
    let index = 1;

    if (federationId) {
      conditions.push(`c.federation_id = $${index++}`);
      values.push(federationId);
    }

    const result = await pool.query(
      `SELECT b.id, b.customer_id, b.service_id, b.status, b.address, b.description,
              b.created_at, b.location,
              ST_Y(b.location::geometry) as lat, ST_X(b.location::geometry) as lng,
              s.name as service_name,
              u.name as customer_name
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN users u ON u.id = b.customer_id
       LEFT JOIN cooperatives c ON c.id = b.cooperative_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY b.created_at DESC
       LIMIT 100`,
      values
    );

    const bookings = result.rows.map((row: any) => {
      let nearestSociety = null;
      return { ...row, nearestSociety };
    });

    for (const booking of bookings) {
      const nearest = await pool.query(
        `SELECT ct.cooperative_id, c.name as cooperative_name,
                ST_Distance(ct.polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
         FROM cooperative_territories ct
         JOIN cooperatives c ON c.id = ct.cooperative_id
         WHERE ct.status = 'active'
         ORDER BY distance_km ASC
         LIMIT 1`,
        [booking.lng, booking.lat]
      );
      booking.nearestSociety = nearest.rows[0] || null;
    }

    return bookings;
  },

  async assignBookingToSociety(bookingId: string, cooperativeId: string, assignedBy: string) {
    const territory = await this.getTerritoryByCooperative(cooperativeId);
    const result = await pool.query(
      `UPDATE bookings SET cooperative_id = $1, territory_id = $2, territory_version = $3 WHERE id = $4 RETURNING id`,
      [cooperativeId, territory?.id || null, territory?.version || null, bookingId]
    );
    return result.rows[0] || null;
  },

  async getUnassignedCount(federationId?: string) {
    const conditions = [`b.cooperative_id IS NULL`, `b.location IS NOT NULL`];
    const values: unknown[] = [];

    if (federationId) {
      conditions.push(`c.federation_id = $1`);
      values.push(federationId);
    }

    const result = await pool.query(
      `SELECT count(*)::int as count FROM bookings b
       LEFT JOIN cooperatives c ON c.id = b.cooperative_id
       WHERE ${conditions.join(" AND ")}`,
      values
    );
    return result.rows[0]?.count || 0;
  },

  async getFederationCoverageStats(federationId: string) {
    const societies = await pool.query(
      `SELECT count(*)::int as count FROM cooperatives WHERE federation_id = $1`,
      [federationId]
    );
    const territories = await pool.query(
      `SELECT count(*)::int as count FROM cooperative_territories ct
       JOIN cooperatives c ON c.id = ct.cooperative_id
       WHERE c.federation_id = $1 AND ct.status = 'active'`,
      [federationId]
    );
    const workers = await pool.query(
      `SELECT count(*)::int as count FROM workers w
       JOIN cooperatives c ON c.id = w.cooperative_id
       WHERE c.federation_id = $1`,
      [federationId]
    );
    const bookings = await pool.query(
      `SELECT count(*)::int as count FROM bookings b
       JOIN cooperatives c ON c.id = b.cooperative_id
       WHERE c.federation_id = $1`,
      [federationId]
    );
    const unassigned = await this.getUnassignedCount(federationId);

    return {
      societyCount: societies.rows[0]?.count || 0,
      territoryCount: territories.rows[0]?.count || 0,
      workerCount: workers.rows[0]?.count || 0,
      bookingCount: bookings.rows[0]?.count || 0,
      unassignedCount: unassigned,
    };
  },

  async detectTerritoryGaps(federationId: string) {
    const result = await pool.query(
      `WITH federation_bounds AS (
         SELECT ST_ConvexHull(ST_Collect(ct.polygon::geometry)) as hull
         FROM cooperative_territories ct
         JOIN cooperatives c ON c.id = ct.cooperative_id
         WHERE c.federation_id = $1 AND ct.status = 'active'
       ),
       gaps AS (
         SELECT (ST_Dump(ST_Difference(
           fb.hull,
           (SELECT ST_Union(ct.polygon::geometry)
            FROM cooperative_territories ct
            JOIN cooperatives c ON c.id = ct.cooperative_id
            WHERE c.federation_id = $1 AND ct.status = 'active')
         ))).geom as geom
         FROM federation_bounds fb
       )
       SELECT ST_AsGeoJSON(g.geom)::jsonb as geometry,
              ST_Area(g.geom::geography) / 1000000 as area_km2,
              ST_Y(ST_Centroid(g.geom)) as center_lat,
              ST_X(ST_Centroid(g.geom)) as center_lng
       FROM gaps g
       WHERE ST_Area(g.geom::geography) / 1000000 > 0.1
       ORDER BY area_km2 DESC
       LIMIT 20`,
      [federationId]
    );
    return result.rows;
  },
};
