-- Phase 4: Payments, Settlements, Invoices, Earnings

-- Payment orders
create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  customer_id uuid not null references users(id),
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  provider text not null,
  provider_order_id text,
  idempotency_key text not null,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_orders_idempotency_idx on payment_orders(customer_id, idempotency_key);
create index if not exists payment_orders_booking_idx on payment_orders(booking_id);

-- Payment transactions
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  type text not null check (type in ('charge', 'refund', 'capture', 'void')),
  amount numeric(12, 2) not null,
  status text not null check (status in ('initiated', 'success', 'failed')),
  provider_transaction_id text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_transactions_order_idx on payment_transactions(payment_order_id);

-- Payment refunds
create table if not exists payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  amount numeric(12, 2) not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  provider_refund_id text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payment_refunds_order_idx on payment_refunds(payment_order_id);

-- Webhook events (extended)
alter table payment_webhook_events add column if not exists event_type text;
alter table payment_webhook_events add column if not exists attempts int not null default 0;
alter table payment_webhook_events add column if not exists last_error text;

-- Payment ledger (immutable)
create table if not exists payment_ledger (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders(id),
  entry_type text not null check (entry_type in ('debit', 'credit', 'fee', 'refund', 'cooperative_share', 'worker_share', 'tax')),
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  description text,
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists payment_ledger_order_idx on payment_ledger(payment_order_id);

-- Settlements
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references cooperatives(id),
  period_start date not null,
  period_end date not null,
  total_bookings int not null default 0,
  total_revenue numeric(14, 2) not null default 0,
  platform_fee numeric(14, 2) not null default 0,
  cooperative_share numeric(14, 2) not null default 0,
  worker_share numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'processing', 'completed', 'failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cooperative_id, period_start, period_end)
);
create index if not exists settlements_coop_idx on settlements(cooperative_id, period_start desc);

-- Invoices
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid not null references bookings(id),
  customer_id uuid not null references users(id),
  worker_id uuid not null references workers(id),
  service_id uuid not null references services(id),
  subtotal numeric(12, 2) not null,
  discount numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  platform_fee numeric(12, 2) not null default 0,
  cooperative_share numeric(12, 2) not null default 0,
  worker_share numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'partially_paid', 'refunded')),
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  pdf_url text,
  created_at timestamptz not null default now()
);
create index if not exists invoices_booking_idx on invoices(booking_id);
create index if not exists invoices_customer_idx on invoices(customer_id);
create index if not exists invoices_worker_idx on invoices(worker_id);

-- Extend workers table for payout
alter table workers add column if not exists payout_account_provider text;
alter table workers add column if not exists payout_account_reference text;
alter table workers add column if not exists payout_account_verified_at timestamptz;