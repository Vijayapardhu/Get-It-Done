-- Artwork for services and categories.
--
-- The app rendered every category as a line glyph picked from a hardcoded
-- client-side table, which meant a new service category shipped as a generic
-- fallback icon until the app was rebuilt. Artwork now lives with the data:
-- the backend owns what a category looks like, and the app renders whatever it
-- is given, falling back to the glyph only when no artwork is set.
--
-- Two fields rather than one, because they are not interchangeable:
--   image_url     a raster PNG (or WebP) — photography and illustration
--   animation_url a Lottie JSON — used where motion earns its place
--
-- Both are URLs, not blobs. Images are served from object storage, so the
-- database stays small and a CDN can sit in front without a schema change.

ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS animation_url text;

ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS animation_url text;

-- `services.category` is free text and is what the app groups by, so a service
-- whose category has artwork should be able to inherit it without a join per
-- row. This index keeps that lookup cheap.
CREATE INDEX IF NOT EXISTS services_category_idx ON services (category);

-- Accent colour, so a new category arrives with its own tint rather than
-- borrowing whichever one the client-side table happened to have.
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS accent_color text;

-- Reject anything that is not a hex colour: this value is interpolated into a
-- theme on the client, and a malformed one would render as an invisible tile.
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_accent_color_check;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_accent_color_check
  CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$');
