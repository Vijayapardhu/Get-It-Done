INSERT INTO federations (id, name, code, state)
VALUES ('00000000-0000-0000-0000-000000000111', 'Andhra Pradesh Labour Cooperative Federation', 'APLCF', 'Andhra Pradesh')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, name, email, phone, password_hash, role, status)
VALUES ('0e238853-5d90-4faa-9a04-aca062cdcdbd', 'Federation Admin', 'admin@apfederation.coop', '+919999990301', '$2b$10$5SlKabZcg.1tO4hGbQhEre2zYyyvozVaTgYbl3Oy9jj2vED2vrQbq', 'federation_admin', 'active')
ON CONFLICT (email) DO UPDATE SET password_hash = '$2b$10$5SlKabZcg.1tO4hGbQhEre2zYyyvozVaTgYbl3Oy9jj2vED2vrQbq';

INSERT INTO admin_scopes (user_id, federation_id)
VALUES ('0e238853-5d90-4faa-9a04-aca062cdcdbd', '00000000-0000-0000-0000-000000000111')
ON CONFLICT DO NOTHING;
