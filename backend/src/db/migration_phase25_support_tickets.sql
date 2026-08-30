-- Phase 25: the support-ticket columns routes/support.ts has always used.
--
-- Same class of drift as phase 24. `complaints` was created in schema.sql with
-- six columns and never extended, while the support router grew a full ticket
-- workflow on top of it. On a database built from the migration list every
-- support endpoint failed:
--
--   POST   /support/tickets      -> INSERT names priority, category  -> 500
--   GET    /support/tickets      -> LEFT JOIN users a ON a.id = c.assigned_to
--   GET    /support/tickets/stats-> GROUP BY category / priority, resolved_at
--   PATCH  /support/tickets/:id  -> sets assigned_to, resolution, resolved_at,
--                                   updated_at
--
-- phase10 was meant to close exactly these gaps ("missing_entities") and added
-- complaint_comments, but left the parent table as it found it.

-- `subject` is accepted by createTicketSchema and was dropped on the floor: the
-- INSERT never named it, so every ticket lost its title. The column is added
-- here and the INSERT is corrected alongside this migration.
alter table complaints add column if not exists subject text;

alter table complaints add column if not exists priority text not null default 'medium';
alter table complaints add column if not exists category text not null default 'other';

-- Constraints mirror the zod enums in support.ts rather than being looser than
-- the API: a value the router will not accept should not be storable either.
alter table complaints drop constraint if exists complaints_priority_check;
alter table complaints add  constraint complaints_priority_check
  check (priority in ('low', 'medium', 'high', 'critical'));

alter table complaints drop constraint if exists complaints_category_check;
alter table complaints add  constraint complaints_category_check
  check (category in ('booking', 'payment', 'worker', 'service', 'technical', 'billing', 'other'));

-- `on delete set null`: an operator leaving must not delete the ticket they
-- happened to be holding.
alter table complaints add column if not exists assigned_to uuid references users(id) on delete set null;

alter table complaints add column if not exists resolution  text;
alter table complaints add column if not exists resolved_at timestamptz;
alter table complaints add column if not exists updated_at  timestamptz not null default now();

create index if not exists complaints_status_idx   on complaints(status, created_at desc);
create index if not exists complaints_assigned_idx on complaints(assigned_to);

drop trigger if exists update_complaints_updated_at on complaints;
create trigger update_complaints_updated_at
  before update on complaints
  for each row execute function update_updated_at_column();
