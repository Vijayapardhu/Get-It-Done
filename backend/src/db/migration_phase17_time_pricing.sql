-- Time-based pricing.
--
-- The catalogue charged per SERVICE: one price for "Plumbing", whatever the
-- job. That prices a dripping tap the same as a morning's work, so the worker
-- loses on the long jobs and the customer overpays on the short ones -- and on
-- a cooperative platform the worker losing is the part that matters, because
-- the whole point is that the person doing the work is paid properly for the
-- time they spend.
--
-- So a booking now buys TIME. The customer picks how long they need, the
-- catalogue advertises a rate per minute, and the quote is rate x minutes plus
-- the same travel, urgency, surge and tax it always had.
--
-- base_price is kept, not dropped. It is the frozen price on every historical
-- booking and every invoice already issued, and it remains the fallback for a
-- service an operator has not given a rate yet.

alter table services add column if not exists price_per_minute numeric(10,2);

-- The bounds an operator sets per service. A deep clean has a floor below
-- which the job cannot be done at all, and a ceiling stops a mis-tap booking
-- someone for fourteen hours.
alter table services add column if not exists min_minutes integer not null default 30;
alter table services add column if not exists max_minutes integer not null default 240;
alter table services add column if not exists default_minutes integer not null default 60;

alter table services drop constraint if exists services_minutes_sane;
alter table services add constraint services_minutes_sane check (
  min_minutes > 0
  and max_minutes >= min_minutes
  -- A default outside its own bounds would be offered and then rejected.
  and default_minutes between min_minutes and max_minutes
);

alter table services drop constraint if exists services_rate_positive;
alter table services add constraint services_rate_positive
  check (price_per_minute is null or price_per_minute > 0);

-- How long this booking was bought for. Nullable: every booking placed before
-- this migration was bought per service, and back-filling a duration onto them
-- would invent a fact about work already done.
alter table bookings add column if not exists duration_minutes integer;

alter table bookings drop constraint if exists bookings_duration_positive;
alter table bookings add constraint bookings_duration_positive
  check (duration_minutes is null or duration_minutes > 0);

-- Seed rates from the prices already advertised, so no service silently loses
-- its price the moment the app starts asking for a rate. An hour of work at
-- the old flat price is the closest honest reading of what these meant.
update services
   set price_per_minute = round(base_price / 60.0, 2)
 where price_per_minute is null
   and base_price > 0;
