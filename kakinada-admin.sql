-- Kakinada Labour Cooperative Society Admin
-- Run this on the production database

-- 1. Create Kakinada cooperative (if not exists)
INSERT INTO cooperatives (id, name, district, state, federation_id)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000101',
  'Kakinada Labour Cooperative Society',
  'Kakinada',
  'Andhra Pradesh',
  '00000000-0000-0000-0000-000000000111'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create admin user with hashed password
-- Password: Kakinada@2025
INSERT INTO users (id, name, email, phone, role, language, password_hash)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000501',
  'Kakinada Admin',
  'admin@kakinada.coop',
  '+919999990301',
  'society_admin',
  'en',
  '$2b$12$AVHF/lNV8/dut8qxT01g6O8z5Qxo3jpIW2iz/VE8vEqgBXGk6Ptqy'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Link admin to Kakinada cooperative
INSERT INTO admin_scopes (user_id, cooperative_id)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000501',
  'a1b2c3d4-0000-0000-0000-000000000101'
)
ON CONFLICT DO NOTHING;
