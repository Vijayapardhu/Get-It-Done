-- Give demand forecasting an area to group by.
--
-- routes/ai.ts built its history with `GROUP BY b.created_at::date, b.address,
-- s.name` -- and `bookings.address` is the free-text address the customer
-- typed: "Flat 302, Sai Enclave, Road No 4, Kukatpally". Every booking is its
-- own unique "area", so the group-by returned roughly one row per booking and
-- the area dimension carried no signal at all.
--
-- It was worse than useless downstream. ai/main.py filtered the supplied
-- history to rows whose area appeared in its own hardcoded default list
-- ("Vijayawada Central", "Benz Circle", "Gannavaram"). Street addresses never
-- matched, the filtered history was always empty, `len(history) >= 3` was never
-- true, the RandomForestRegressor was never fitted, and every response fell
-- through to the `expected = 18 + area_index * 5 + ...` baseline branch. The
-- forecast was an arithmetic sequence one hundred percent of the time.
--
-- Two columns, deliberately:
--
--   locality   -- a human name, when one is known. Nullable forever: it comes
--                 from reverse geocoding, which is a paid call that may fail,
--                 be unconfigured, or simply not have run yet. Nothing may
--                 depend on it being present.
--
--   grid_cell  -- a ~2km square derived from the booking's own geography.
--                 Always available, including for every historical row, because
--                 `location` has been NOT NULL since the first schema. This is
--                 what the model actually groups on; `locality` is what the
--                 admin UI shows.
--
-- Deriving the cell rather than storing a name is what makes the backfill total
-- instead of best-effort: there is no deployment where some bookings can be
-- placed on the map and others cannot.

alter table bookings add column if not exists locality text;

-- 0.02 degrees is ~2.2 km of latitude, and ~2.0 km of longitude at Telangana's
-- latitude -- close enough to square for grouping, and small enough that a cell
-- is a neighbourhood rather than a city.
alter table bookings add column if not exists grid_cell text
  generated always as (
    round((st_y(location::geometry) * 50)::numeric) / 50 || ',' ||
    round((st_x(location::geometry) * 50)::numeric) / 50
  ) stored;

create index if not exists bookings_grid_cell_idx on bookings (grid_cell, created_at desc);
create index if not exists bookings_locality_idx on bookings (locality) where locality is not null;

comment on column bookings.grid_cell is
  'Derived ~2km square from `location`, used as the demand-forecast area key.
   Generated, so it exists for every historical row and cannot drift from the
   geography it describes.';

comment on column bookings.locality is
  'Human-readable area name from reverse geocoding. Nullable forever -- the
   forecast groups on grid_cell and only uses this for display.';

-- Service orders carry the address for a whole checkout; same reasoning.
alter table service_orders add column if not exists locality text;
