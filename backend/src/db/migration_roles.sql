-- Migration: Add roles table for custom role management
-- Run after existing migrations

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Role permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- User roles assignment table (for custom roles)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (user_id, role_id)
);

-- Insert default system roles
INSERT INTO roles (id, name, description, is_system, is_custom) VALUES
  (gen_random_uuid(), 'customer', 'Regular customer who books services', true, false),
  (gen_random_uuid(), 'worker', 'Service provider/worker', true, false),
  (gen_random_uuid(), 'institutional_customer', 'Institutional/organizational customer', true, false),
  (gen_random_uuid(), 'society_admin', 'Cooperative society administrator', true, false),
  (gen_random_uuid(), 'federation_admin', 'Federation level administrator', true, false),
  (gen_random_uuid(), 'support_staff', 'Customer support staff', true, false),
  (gen_random_uuid(), 'system_admin', 'System super administrator', true, false)
ON CONFLICT (name) DO NOTHING;

-- Default permissions for system roles
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES 
  ('users.read'), ('users.write'), ('users.delete'),
  ('bookings.read'), ('bookings.write'), ('bookings.cancel'),
  ('workers.read'), ('workers.write'), ('workers.verify'),
  ('services.read'), ('services.write'), ('services.delete'),
  ('cooperatives.read'), ('cooperatives.write'),
  ('federations.read'), ('federations.write'),
  ('payments.read'), ('payments.write'), ('payments.refund'),
  ('analytics.read'), ('analytics.export'),
  ('support.read'), ('support.write'),
  ('system.config'), ('system.health'),
  ('roles.read'), ('roles.write'), ('roles.delete'),
  ('audit.read'), ('security.read')
) AS p(permission)
WHERE r.is_system = true
ON CONFLICT DO NOTHING;

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

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS user_roles_expires_idx ON user_roles(expires_at) WHERE expires_at IS NOT NULL;