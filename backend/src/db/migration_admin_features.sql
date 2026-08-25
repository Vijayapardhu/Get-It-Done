-- Migration: Admin features tables
-- Run after existing migrations

-- 1. Pricing rules tables
CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area geography(polygon, 4326),
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  multiplier numeric(4,2) NOT NULL DEFAULT 1.0 CHECK (multiplier >= 1.0 AND multiplier <= 10.0),
  trigger text NOT NULL CHECK (trigger IN ('demand_threshold', 'time', 'weather')),
  demand_threshold numeric(6,2),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_rules_area_idx ON pricing_rules USING GIST (area);
CREATE INDEX IF NOT EXISTS pricing_rules_service_idx ON pricing_rules(service_id);

-- Travel fees
CREATE TABLE IF NOT EXISTS travel_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  base_km int NOT NULL DEFAULT 5 CHECK (base_km > 0),
  base_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  per_km_rate numeric(8,2) NOT NULL DEFAULT 0 CHECK (per_km_rate >= 0),
  max_distance_km int NOT NULL DEFAULT 50 CHECK (max_distance_km > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id)
);

-- Tax rules
CREATE TABLE IF NOT EXISTS tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  applies_to text NOT NULL CHECK (applies_to IN ('service', 'worker', 'platform')),
  jurisdiction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type text NOT NULL,
  title_template text NOT NULL,
  body_template text NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  language text NOT NULL DEFAULT 'en',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_templates_type_idx ON notification_templates(type);

-- Insert default notification templates
INSERT INTO notification_templates (name, type, title_template, body_template, channels, language, variables) VALUES
('booking_confirmed', 'booking.confirmed', 'Booking Confirmed', 'Your booking {{booking_number}} for {{service_name}} has been confirmed for {{scheduled_at}}.', ARRAY['in_app', 'push', 'sms'], 'en', '["booking_number", "service_name", "scheduled_at"]'),
('worker_assigned', 'booking.worker_assigned', 'Worker Assigned', '{{worker_name}} has been assigned to your booking {{booking_number}}. Contact: {{worker_phone}}', ARRAY['in_app', 'push', 'sms'], 'en', '["worker_name", "booking_number", "worker_phone"]'),
('worker_arrived', 'booking.worker_arrived', 'Worker Arrived', 'Your worker {{worker_name}} has arrived at the location.', ARRAY['in_app', 'push'], 'en', '["worker_name"]'),
('job_started', 'booking.started', 'Job Started', 'Work has started on your booking {{booking_number}}.', ARRAY['in_app', 'push'], 'en', '["booking_number"]'),
('job_completed', 'booking.completed', 'Job Completed', 'Your booking {{booking_number}} for {{service_name}} has been completed.', ARRAY['in_app', 'push', 'sms'], 'en', '["booking_number", "service_name"]'),
('payment_received', 'payment.received', 'Payment Received', 'Payment of ₹{{amount}} received for booking {{booking_number}}.', ARRAY['in_app', 'push', 'sms', 'email'], 'en', '["amount", "booking_number"]'),
('rating_request', 'rating.request', 'Rate Your Service', 'Please rate your experience with {{worker_name}} for booking {{booking_number}}.', ARRAY['in_app', 'push', 'email'], 'en', '["worker_name", "booking_number"]'),
('emergency_alert', 'emergency.assigned', 'Emergency Service Request', 'You have been assigned an emergency service request for {{service_name}} at {{address}}.', ARRAY['in_app', 'push', 'sms'], 'en', '["service_name", "address"]'),
('verification_approved', 'worker.verification.approved', 'Verification Approved', 'Congratulations! Your worker verification has been approved.', ARRAY['in_app', 'push', 'email', 'sms'], 'en', '[]'),
('verification_rejected', 'worker.verification.rejected', 'Verification Rejected', 'Your worker verification was rejected. Reason: {{reason}}', ARRAY['in_app', 'push', 'email', 'sms'], 'en', '["reason"]'),
('certification_expiring', 'worker.certification_expiring', 'Certification Expiring Soon', 'Your {{certification_name}} certification expires on {{expiry_date}}. Please renew.', ARRAY['in_app', 'push', 'email'], 'en', '["certification_name", "expiry_date"]'),
('support_ticket_created', 'support.ticket_created', 'Support Ticket Created', 'Your support ticket has been created. We will get back to you soon.', ARRAY['in_app', 'email'], 'en', '[]'),
('support_ticket_resolved', 'support.ticket_resolved', 'Ticket Resolved', 'Your support ticket has been resolved: {{resolution}}', ARRAY['in_app', 'email', 'push'], 'en', '["resolution"]')
ON CONFLICT (name) DO NOTHING;

-- 3. Report exports
CREATE TABLE IF NOT EXISTS report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'xlsx', 'pdf')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url text,
  file_size bigint,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_exports_requested_by_idx ON report_exports(requested_by);
CREATE INDEX IF NOT EXISTS report_exports_status_idx ON report_exports(status);

-- 4. Report exports for cooperative/federation dashboards
-- Materialized views for analytics (if not exists)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_booking_stats AS
SELECT
  date_trunc('day', b.created_at)::date as day,
  b.service_id,
  s.name as service_name,
  s.category,
  b.is_emergency,
  count(*) as total_bookings,
  count(*) FILTER (WHERE b.status = 'completed') as completed_bookings,
  count(*) FILTER (WHERE b.status = 'cancelled') as cancelled_bookings,
  count(*) FILTER (WHERE b.status = 'expired') as expired_bookings
FROM bookings b
JOIN services s ON s.id = b.service_id
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX IF NOT EXISTS mv_booking_stats_idx ON mv_booking_stats(day, service_id, is_emergency);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_worker_performance AS
SELECT
  w.id as worker_id,
  w.user_id,
  w.verification_status,
  w.current_status,
  w.rating,
  count(b.id) as total_assigned,
  count(b.id) FILTER (WHERE b.status = 'completed') as completed_jobs,
  count(b.id) FILTER (WHERE b.status = 'cancelled') as cancelled_jobs,
  avg(r.rating) as avg_rating,
  count(r.id) as total_reviews
FROM workers w
LEFT JOIN bookings b ON b.worker_id = w.id
LEFT JOIN reviews r ON r.worker_id = w.id
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX IF NOT EXISTS mv_worker_performance_idx ON mv_worker_performance(worker_id);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_booking_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_worker_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_satisfaction;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_geography;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_welfare;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fairness;
END $$;

-- Trigger function for updated_at
-- Shared updated_at trigger function.
-- This used to sit inside a `DO $$ ... $$` block with its own `$$` body, and
-- the inner delimiter closed the outer block early ("syntax error at or near
-- BEGIN"). Hoisted to top level so there is nothing to nest.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_travel_fees_updated_at ON travel_fees;
CREATE TRIGGER update_travel_fees_updated_at
  BEFORE UPDATE ON travel_fees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_rules_updated_at ON pricing_rules;
CREATE TRIGGER update_pricing_rules_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();