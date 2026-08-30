-- Phase 27: Training module schema
--
-- Worker app needs: module list with progress, quiz with questions/options,
-- submission with scoring, certificates.
-- Admin needs: CRUD for modules and questions.

-- =========================================================================
-- Training modules (catalogue of courses)
-- =========================================================================
create table if not exists training_modules (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  category          text,
  duration_minutes  int check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 480)),
  passing_score     int not null default 70 check (passing_score between 50 and 100),
  status            text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists training_modules_status_idx
  on training_modules (status, created_at desc);

-- =========================================================================
-- Questions per module (single-choice MCQ)
-- =========================================================================
create table if not exists training_questions (
  id              uuid primary key default gen_random_uuid(),
  module_id       uuid not null references training_modules(id) on delete cascade,
  text            text not null,
  options         jsonb not null, -- array of {text, isCorrect}
  explanation     text,
  order_index     int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists training_questions_module_idx
  on training_questions (module_id, order_index);

-- =========================================================================
-- Worker training records (completion tracking)
-- =========================================================================
alter table worker_training_records
  add column if not exists training_module_id uuid references training_modules(id) on delete set null;

alter table worker_training_records
  add column if not exists score int check (score is null or (score between 0 and 100));

alter table worker_training_records
  add column if not exists retake_count int not null default 0;

alter table worker_training_records
  add column if not exists updated_at timestamptz not null default now();

create index if not exists worker_training_records_worker_module_idx
  on worker_training_records (worker_id, training_module_id);

-- =========================================================================
-- Updated_at trigger for training_modules
-- =========================================================================
create or replace function update_training_modules_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists update_training_modules_updated_at on training_modules;
create trigger update_training_modules_updated_at
  before update on training_modules
  for each row execute function update_training_modules_updated_at();

-- =========================================================================
-- Seed some sample modules (admin can add more via API)
-- =========================================================================
insert into training_modules (title, description, category, duration_minutes, passing_score, status)
values
  ('Customer Service Excellence', 'Professional communication, complaint handling, and building trust with customers', 'Soft Skills', 45, 70, 'published'),
  ('Workplace Safety Basics', 'Hazard identification, PPE usage, and emergency procedures for field workers', 'Safety', 30, 80, 'published'),
  ('Digital Payment Handling', 'UPI, QR codes, and secure transaction practices', 'Finance', 25, 75, 'published'),
  ('Tool Maintenance & Care', 'Proper cleaning, storage, and inspection of trade tools', 'Trade Skills', 35, 70, 'published'),
  ('First Aid Awareness', 'Basic first aid for common workplace injuries', 'Safety', 40, 80, 'published')
on conflict do nothing;

-- Seed questions for "Customer Service Excellence"
insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'A customer is unhappy with the service. What is your FIRST step?',
       '[{"text": "Listen actively and acknowledge their concern", "isCorrect": true}, {"text": "Explain why the service was correct", "isCorrect": false}, {"text": "Offer a discount immediately", "isCorrect": false}, {"text": "Ask them to contact support", "isCorrect": false}]'::jsonb,
       'Active listening shows respect and helps de-escalate the situation before finding a solution.',
       0
from training_modules where title = 'Customer Service Excellence' limit 1
on conflict do nothing;

insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'You arrive 15 minutes late due to traffic. What should you do?',
       '[{"text": "Apologize sincerely and explain briefly", "isCorrect": true}, {"text": "Start working without mentioning it", "isCorrect": false}, {"text": "Blame the traffic and say it is not your fault", "isCorrect": false}, {"text": "Ask the customer to reschedule", "isCorrect": false}]'::jsonb,
       'Acknowledging the delay shows professionalism and respect for the customer time.',
       1
from training_modules where title = 'Customer Service Excellence' limit 1
on conflict do nothing;

insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'A customer asks for a service you are not certified for. What do you do?',
       '[{"text": "Politely decline and suggest they book the correct service", "isCorrect": true}, {"text": "Attempt it anyway since you have similar experience", "isCorrect": false}, {"text": "Say yes and figure it out on the job", "isCorrect": false}, {"text": "Tell them to do it themselves", "isCorrect": false}]'::jsonb,
       'Working outside your certification risks safety and quality. Always refer to the right specialist.',
       2
from training_modules where title = 'Customer Service Excellence' limit 1
on conflict do nothing;

-- Seed questions for "Workplace Safety Basics"
insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'Before starting any job, what should you check FIRST?',
       '[{"text": "That you have the correct PPE for the task", "isCorrect": true}, {"text": "That the customer has paid", "isCorrect": false}, {"text": "That your tools are sharp", "isCorrect": false}, {"text": "That the weather is good", "isCorrect": false}]'::jsonb,
       'PPE is your first line of defense against injury. Always verify you have the right gear.',
       0
from training_modules where title = 'Workplace Safety Basics' limit 1
on conflict do nothing;

insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'You notice a damaged power cord on a tool. What do you do?',
       '[{"text": "Stop using it and report it for repair/replacement", "isCorrect": true}, {"text": "Wrap it with tape and continue", "isCorrect": false}, {"text": "Use it carefully avoiding the damaged part", "isCorrect": false}, {"text": "Finish the job quickly then report", "isCorrect": false}]'::jsonb,
       'Damaged electrical equipment is a shock and fire hazard. Never use it.',
       1
from training_modules where title = 'Workplace Safety Basics' limit 1
on conflict do nothing;

insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'When lifting heavy objects, what is the correct technique?',
       '[{"text": "Bend knees, keep back straight, hold load close to body", "isCorrect": true}, {"text": "Bend at waist, use back muscles", "isCorrect": false}, {"text": "Twist while lifting to position the load", "isCorrect": false}, {"text": "Lift with arms fully extended", "isCorrect": false}]'::jsonb,
       'Proper lifting technique protects your back from serious injury.',
       2
from training_modules where title = 'Workplace Safety Basics' limit 1
on conflict do nothing;

-- Seed questions for "Digital Payment Handling"
insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'A customer wants to pay via UPI. What should you verify FIRST?',
       '[{"text": "The UPI ID matches the customer name", "isCorrect": true}, {"text": "The amount is correct", "isCorrect": false}, {"text": "The transaction ID is generated", "isCorrect": false}, {"text": "The customer has internet", "isCorrect": false}]'::jsonb,
       'Always verify the payee name matches to prevent fraud.',
       0
from training_modules where title = 'Digital Payment Handling' limit 1
on conflict do nothing;

-- Seed questions for "Tool Maintenance & Care"
insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'After completing a job, what should you do with your tools?',
       '[{"text": "Clean, inspect, and store them properly", "isCorrect": true}, {"text": "Leave them in the toolbox until next job", "isCorrect": false}, {"text": "Wipe them on your clothes", "isCorrect": false}, {"text": "Give them to the customer", "isCorrect": false}]'::jsonb,
       'Proper tool care extends life and ensures safety for the next job.',
       0
from training_modules where title = 'Tool Maintenance & Care' limit 1
on conflict do nothing;

-- Seed questions for "First Aid Awareness"
insert into training_questions (module_id, text, options, explanation, order_index)
select id,
       'A colleague gets a minor cut. What is the FIRST step?',
       '[{"text": "Apply pressure with clean cloth and elevate", "isCorrect": true}, {"text": "Ignore it and keep working", "isCorrect": false}, {"text": "Apply coffee powder", "isCorrect": false}, {"text": "Run to the hospital immediately", "isCorrect": false}]'::jsonb,
       'Direct pressure stops bleeding. Elevate the wound if possible.',
       0
from training_modules where title = 'First Aid Awareness' limit 1
on conflict do nothing;