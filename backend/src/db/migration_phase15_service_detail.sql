-- Editorial content for the service detail page.
--
-- The catalogue previously carried a name, a price and one line of
-- description, which is enough for a card and not enough for a page. A
-- customer deciding whether to book wants the questions answered that make
-- them hesitate: what does this actually include, what does it NOT include,
-- what will happen when someone arrives, and what about the thing I am
-- worried about.
--
-- The "does not include" list is the one that matters most and the one an
-- operator is most tempted to leave empty. A customer who finds out on the
-- doorstep that carpet cleaning was never part of "cleaning" is a dispute, a
-- refund and a one-star review; saying so on the page costs nothing.
--
-- Stored as jsonb on the service rather than in four child tables. This is
-- reference copy that is written and read as a whole, never queried across
-- services and never joined to; four tables would buy nothing and cost four
-- joins on a page load.

alter table services add column if not exists hero_image_url text;
alter table services add column if not exists includes  jsonb not null default '[]'::jsonb;
alter table services add column if not exists excludes  jsonb not null default '[]'::jsonb;
alter table services add column if not exists steps     jsonb not null default '[]'::jsonb;
alter table services add column if not exists faqs      jsonb not null default '[]'::jsonb;

-- Arrays, not objects or scalars. Without this a typo in an admin payload
-- stores `"includes": "sweeping"` and the app's list parser silently renders
-- nothing rather than failing where the mistake was made.
alter table services drop constraint if exists services_includes_is_array;
alter table services add constraint services_includes_is_array
  check (jsonb_typeof(includes) = 'array');

alter table services drop constraint if exists services_excludes_is_array;
alter table services add constraint services_excludes_is_array
  check (jsonb_typeof(excludes) = 'array');

alter table services drop constraint if exists services_steps_is_array;
alter table services add constraint services_steps_is_array
  check (jsonb_typeof(steps) = 'array');

alter table services drop constraint if exists services_faqs_is_array;
alter table services add constraint services_faqs_is_array
  check (jsonb_typeof(faqs) = 'array');
