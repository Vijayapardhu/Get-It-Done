-- A catalogue worth browsing.
--
-- The app shipped with three services, which is not a catalogue -- a home
-- screen built around a three-across grid showed one row and stopped, and
-- search had nothing to search. This seeds the trades a cooperative in coastal
-- Andhra actually supplies, grouped so the grid has shape.
--
-- Artwork is deliberately left null on the new rows. The app falls through to
-- its bundled per-trade glyph, which differs between an air conditioner and a
-- refrigerator and cannot fail to load. Upload per-service art later and it
-- takes over automatically.
--
-- It does NOT inherit the category's picture: every service in a category
-- shares one file, so a four-service Appliances group rendered the same
-- illustration four times, which reads as a rendering bug.
--
-- Prices are per-minute, matching phase 17. base_price is kept in step as the
-- default-duration price so anything still reading it stays sane.

-- ── Categories ────────────────────────────────────────────────────────────
-- Accent colours are the ones the app's ServiceVisuals table already uses per
-- trade, so a category's tint matches the glyph a client falls back to.
INSERT INTO service_categories (id, name, description, accent_color, display_order)
VALUES
  ('00000000-0000-0000-0000-0000000003a1', 'Home Repair',  'Plumbing, wiring, carpentry and the things that break', '#2FA0A0', 1),
  ('00000000-0000-0000-0000-0000000003a2', 'Household',    'Cleaning, laundry, cooking and everyday help',          '#14B8A6', 2),
  ('00000000-0000-0000-0000-0000000003a3', 'Appliances',   'Air conditioners, fridges, washing machines',           '#6366F1', 3),
  ('00000000-0000-0000-0000-0000000003a4', 'Finishing',    'Painting, tiling and the work that shows',              '#8B5CF6', 4),
  ('00000000-0000-0000-0000-0000000003a5', 'Care',         'Pest control, gardening, sanitisation',                 '#65A30D', 5),
  ('00000000-0000-0000-0000-0000000003a6', 'Personal',     'Salon, wellness and errands at home',                   '#EA7C4B', 6)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      accent_color = COALESCE(service_categories.accent_color, EXCLUDED.accent_color),
      display_order = EXCLUDED.display_order;

-- Give the two categories that already carry artwork to the new ones that have
-- none, so the whole grid renders pictures rather than a mix of art and glyphs.
UPDATE service_categories AS target
   SET image_url = source.image_url,
       animation_url = source.animation_url
  FROM (
    SELECT image_url, animation_url
      FROM service_categories
     WHERE image_url IS NOT NULL
     ORDER BY display_order
     LIMIT 1
  ) AS source
 WHERE target.image_url IS NULL;

-- ── Services ──────────────────────────────────────────────────────────────
-- price_per_minute is the real number; a 60-minute visit is what the card
-- shows. min/max bound what a customer may ask for, and pricingService clamps
-- to them server-side regardless of what the client sends.
INSERT INTO services (
  id, name, category, description, base_price, emergency_supported,
  price_per_minute, min_minutes, max_minutes, default_minutes
) VALUES
  -- Home Repair
  ('00000000-0000-0000-0000-000000000204', 'Carpentry',           'Home Repair','Doors, hinges, furniture repair and fittings',        399, false, 6.65, 30, 300, 60),
  ('00000000-0000-0000-0000-000000000205', 'Masonry',             'Home Repair','Wall cracks, plaster, small concrete work',           449, false, 7.48, 60, 480, 90),
  ('00000000-0000-0000-0000-000000000206', 'Welding & Grills',    'Home Repair','Gates, grills, railings and metal repair',            499, false, 8.32, 60, 300, 90),
  ('00000000-0000-0000-0000-000000000207', 'Borewell & Motor',    'Home Repair','Pump priming, motor faults, overhead tank lines',     599, true,  9.98, 30, 240, 60),

  -- Household
  ('00000000-0000-0000-0000-000000000208', 'Deep Cleaning',       'Household','Kitchen, bathroom and full-home deep clean',          899, false, 7.49, 120, 480, 180),
  ('00000000-0000-0000-0000-000000000209', 'Sofa & Carpet Care',  'Household','Upholstery shampoo and stain treatment',              649, false, 10.82, 45, 240, 60),
  ('00000000-0000-0000-0000-00000000020a', 'Cook at Home',        'Household','Daily meals cooked in your kitchen',                  399, false, 6.65, 60, 180, 60),
  ('00000000-0000-0000-0000-00000000020b', 'Laundry & Ironing',   'Household','Wash, dry and press, collected and returned',         249, false, 4.15, 30, 180, 60),

  -- Appliances
  ('00000000-0000-0000-0000-00000000020c', 'AC Service & Repair', 'Appliances','Gas top-up, cooling faults, installation',            599, true,  9.98, 45, 240, 60),
  ('00000000-0000-0000-0000-00000000020d', 'Refrigerator Repair', 'Appliances','Cooling loss, noise, door seals and thermostats',     499, true,  8.32, 45, 180, 60),
  ('00000000-0000-0000-0000-00000000020e', 'Washing Machine',     'Appliances','Drainage, spin faults, drum and belt repair',         449, false, 7.48, 45, 180, 60),
  ('00000000-0000-0000-0000-00000000020f', 'Geyser & Chimney',    'Appliances','Water heaters, chimney degreasing and service',       399, false, 6.65, 45, 180, 60),

  -- Finishing
  ('00000000-0000-0000-0000-000000000210', 'Painting',            'Finishing','Interior and exterior painting, touch-ups',           799, false, 6.66, 120, 600, 120),
  ('00000000-0000-0000-0000-000000000211', 'Tiling & Flooring',   'Finishing','Tile laying, grouting and floor repair',              899, false, 7.49, 120, 600, 120),
  ('00000000-0000-0000-0000-000000000212', 'Waterproofing',       'Finishing','Terrace, bathroom and seepage treatment',             999, false, 8.32, 120, 480, 120),

  -- Care
  ('00000000-0000-0000-0000-000000000213', 'Pest Control',        'Care','Cockroach, termite, mosquito and rodent treatment',   649, false, 10.82, 45, 240, 60),
  ('00000000-0000-0000-0000-000000000214', 'Gardening',           'Care','Lawn care, pruning, planting and terrace gardens',    349, false, 5.82, 60, 300, 60),
  ('00000000-0000-0000-0000-000000000215', 'Water Tank Cleaning', 'Care','Overhead and sump tank cleaning and sanitisation',    599, false, 9.98, 60, 240, 60),

  -- Personal
  ('00000000-0000-0000-0000-000000000216', 'Salon at Home',       'Personal','Haircut, grooming and styling at your door',          499, false, 8.32, 30, 180, 60),
  ('00000000-0000-0000-0000-000000000217', 'Massage & Wellness',  'Personal','Therapeutic massage by trained practitioners',        799, false, 13.32, 60, 180, 60),
  ('00000000-0000-0000-0000-000000000218', 'Elder Care Visit',    'Personal','Companionship, medicine reminders, mobility help',    449, false, 7.48, 60, 480, 120)
ON CONFLICT (id) DO UPDATE
  SET description       = EXCLUDED.description,
      category          = EXCLUDED.category,
      base_price        = EXCLUDED.base_price,
      price_per_minute  = EXCLUDED.price_per_minute,
      min_minutes       = EXCLUDED.min_minutes,
      max_minutes       = EXCLUDED.max_minutes,
      default_minutes   = EXCLUDED.default_minutes;

-- Move the three originals into the expanded scheme so the grouping is
-- coherent rather than "Home Repair, Household, and eighteen others".
UPDATE services SET category = 'Household'  WHERE name = 'Cleaning';
UPDATE services SET category = 'Home Repair' WHERE name IN ('Plumbing', 'Electrical');

-- ── Detail content ────────────────────────────────────────────────────────
-- The service page renders these; a page with an empty "What's included" reads
-- as unfinished. Generic where the trade is generic, specific where it matters.
UPDATE services
   SET includes = COALESCE(NULLIF(includes, '[]'::jsonb), jsonb_build_array(
         'A verified cooperative worker',
         'Labour for the booked duration',
         'Standard tools and consumables',
         'Basic clean-up before leaving'
       )),
       excludes = COALESCE(NULLIF(excludes, '[]'::jsonb), jsonb_build_array(
         'Spare parts and materials, charged at cost',
         'Work beyond the booked duration'
       )),
       steps = COALESCE(NULLIF(steps, '[]'::jsonb), jsonb_build_array(
         'Pick a time and how long you need',
         'A nearby verified worker accepts',
         'Share the start code at your door',
         'Share the finish code when the work is done'
       )),
       faqs = COALESCE(NULLIF(faqs, '[]'::jsonb), jsonb_build_array(
         jsonb_build_object(
           'question', 'What if the job takes longer than I booked?',
           'answer',   'The worker will tell you before continuing. Extra time is added at the same per-minute rate, never as a surprise on the invoice.'
         ),
         jsonb_build_object(
           'question', 'Who is coming to my home?',
           'answer',   'A worker verified by their cooperative society, with documents and skills checked. You see their name, photo and rating before they arrive.'
         ),
         jsonb_build_object(
           'question', 'How is the price decided?',
           'answer',   'You pay for time, at a published per-minute rate. The breakdown before you confirm shows the worker''s share, the cooperative''s share and the welfare fund.'
         )
       ))
 WHERE includes = '[]'::jsonb OR steps = '[]'::jsonb OR faqs = '[]'::jsonb;
