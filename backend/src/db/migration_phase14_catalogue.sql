-- Catalogue fields the redesigned service cards need.
--
-- The new home grid shows each service as a picture with a rating and a price,
-- which needs two things the catalogue did not carry.
--
-- list_price is the "was" figure a promotional price is struck through against.
-- It is NULL by default and stays NULL unless someone is actually running a
-- promotion: a struck-through price that was never charged is a lie printed on
-- the card, and the app only draws one when this is set AND above base_price.
--
-- Ratings are NOT stored here. They are aggregated from reviews at read time by
-- joining through bookings, so the number on a card is the mean of real reviews
-- of real jobs for that service, and cannot drift away from the reviews table.

alter table services add column if not exists list_price numeric(10,2);

alter table services drop constraint if exists services_list_price_check;
alter table services add constraint services_list_price_check
  check (list_price is null or list_price >= base_price);

-- The rating aggregate joins reviews -> bookings -> service_id on every
-- catalogue read, so bookings needs to be searchable by service.
create index if not exists bookings_service_idx on bookings (service_id);
