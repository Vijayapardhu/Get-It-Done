-- One taxonomy for what a worker can do.
--
-- There were two, and they were both live:
--
--   worker_skills      (worker_id, service_id -> services.id, certification_level)
--   worker_skills_new  (worker_id, skill_id   -> skills.id,   level, verified, ...)
--
-- The write path and the read path used different ones. `PUT /workers/me/skills`
-- went through workerService.replaceWorkerSkills into `worker_skills`, while
-- matching's `hasCertification` sub-score read `worker_skills_new`. So a worker
-- declaring their trades wrote to a table dispatch never looked at -- and
-- because `GET /workers/me/skills` read the same old table back, the app looked
-- perfectly consistent while being disconnected from matching entirely.
--
-- Worse: `skills` is not seeded by seed.sql or by any migration. It is empty in
-- every deployment. So `worker_skills_new` could never hold a row that joins,
-- `hasCertification` was false for every worker who has ever existed, and the
-- certification component of the match score has been pinned at its 0.55 floor
-- since the day it was written. `skill_verifications` and `certifications` both
-- FK to `skills(id)`, so they are necessarily empty for the same reason.
--
-- `services` is the taxonomy that is actually populated (21 rows after
-- phase 19) and that bookings, pricing, orders, service areas and matching's
-- own eligibility join already key on. So `services` wins and `skills` goes.
--
-- Nothing is dropped here. `skills` and `worker_skills_new` stay in place,
-- deprecated, until this has run in production and the repointed code has been
-- observed working -- dropping a table in the same migration that stops reading
-- it is how you find out about the one caller you missed.

-- ── 1. worker_skills gains what worker_skills_new had ────────────────────────

alter table worker_skills add column if not exists level text not null default 'beginner';
alter table worker_skills drop constraint if exists worker_skills_level_valid;
alter table worker_skills add constraint worker_skills_level_valid
  check (level in ('beginner', 'intermediate', 'expert', 'master'));

alter table worker_skills add column if not exists years_experience int not null default 0;
alter table worker_skills drop constraint if exists worker_skills_years_sane;
alter table worker_skills add constraint worker_skills_years_sane
  check (years_experience >= 0 and years_experience <= 70);

-- Verification is an ADMIN fact about a worker's claim, not part of the claim.
-- It is why replaceWorkerSkills can no longer be a delete-and-reinsert: a
-- worker editing their own list would silently clear an operator's decision.
alter table worker_skills add column if not exists verified boolean not null default false;
alter table worker_skills add column if not exists verified_at timestamptz;
alter table worker_skills add column if not exists verified_by uuid references users(id);
alter table worker_skills add column if not exists created_at timestamptz not null default now();

create index if not exists worker_skills_service_idx on worker_skills (service_id);
create index if not exists worker_skills_verified_idx on worker_skills (worker_id) where verified;

-- ── 2. requires_certification moves to services ──────────────────────────────
-- The column existed on `skills` and was read by nothing. On `services` it can
-- finally do its job: gate dispatch for work that must not go to an uncertified
-- worker (anything electrical, anything involving gas, childcare, eldercare).
-- Default false so no existing service silently becomes unbookable.

alter table services add column if not exists requires_certification boolean not null default false;

-- ── 3. Backfill ──────────────────────────────────────────────────────────────
-- A no-op wherever `skills` is empty, which is everywhere today. Written
-- anyway, because a deployment where an operator DID create skills through
-- POST /skills must not lose those workers' levels and verifications.
--
-- Matched on name, case- and space-insensitively: it is the only thing the two
-- taxonomies have in common.

insert into worker_skills (worker_id, service_id, certification_level, level,
                           years_experience, verified, verified_at, verified_by)
select wsn.worker_id,
       svc.id,
       wsn.level,
       wsn.level,
       wsn.years_experience,
       wsn.verified,
       wsn.verified_at,
       wsn.verified_by
  from worker_skills_new wsn
  join skills sk on sk.id = wsn.skill_id
  join services svc on lower(btrim(svc.name)) = lower(btrim(sk.name))
on conflict (worker_id, service_id) do update
  set level            = excluded.level,
      years_experience = excluded.years_experience,
      -- Never downgrade a verification during a backfill.
      verified         = worker_skills.verified or excluded.verified,
      verified_at      = coalesce(worker_skills.verified_at, excluded.verified_at),
      verified_by      = coalesce(worker_skills.verified_by, excluded.verified_by);

-- ── 4. Repoint the audit and credential tables ───────────────────────────────
-- Both FK to skills(id), so both are empty for the reason above. Add the
-- services-keyed column, backfill, and relax the old NOT NULL rather than
-- dropping the column, so an existing row (if any deployment has one) survives
-- and can still be read.

alter table skill_verifications add column if not exists service_id uuid references services(id) on delete cascade;
update skill_verifications sv
   set service_id = svc.id
  from skills sk
  join services svc on lower(btrim(svc.name)) = lower(btrim(sk.name))
 where sk.id = sv.skill_id and sv.service_id is null;
alter table skill_verifications alter column skill_id drop not null;
create index if not exists skill_verifications_service_idx on skill_verifications (worker_id, service_id);

alter table certifications add column if not exists service_id uuid references services(id) on delete cascade;
update certifications c
   set service_id = svc.id
  from skills sk
  join services svc on lower(btrim(svc.name)) = lower(btrim(sk.name))
 where sk.id = c.skill_id and c.service_id is null;
alter table certifications alter column skill_id drop not null;
create index if not exists certifications_service_idx on certifications (worker_id, service_id);

-- ── 5. Mark the losing taxonomy ──────────────────────────────────────────────

comment on table skills is
  'DEPRECATED (phase 21). Never seeded, so empty in every deployment. The live
   taxonomy is `services`; worker skills live in `worker_skills`. Drop once the
   phase-21 repoint has been observed in production.';

comment on table worker_skills_new is
  'DEPRECATED (phase 21). Superseded by `worker_skills`, which now carries level,
   years_experience and verification and is keyed on services(id). Drop once the
   phase-21 repoint has been observed in production.';
