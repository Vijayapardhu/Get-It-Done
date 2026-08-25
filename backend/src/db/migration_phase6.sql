
-- Booking attachments table for file attachments to bookings
CREATE TABLE IF NOT EXISTS booking_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    type text NOT NULL,
    filename text NOT NULL,
    file_url text NOT NULL,
    file_hash text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    uploaded_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Booking notes table for text notes on bookings
CREATE TABLE IF NOT EXISTS booking_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    note text NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS booking_attachments_booking_idx ON booking_attachments(booking_id);
CREATE INDEX IF NOT EXISTS booking_notes_booking_idx ON booking_notes(booking_id);
CREATE INDEX IF NOT EXISTS booking_notes_created_by_idx ON booking_notes(created_by);

-- Shared updated_at trigger function (idempotent, top-level so dollar-quoting is safe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $fn$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_booking_attachments_updated_at ON booking_attachments;
CREATE TRIGGER update_booking_attachments_updated_at
    BEFORE UPDATE ON booking_attachments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_notes_updated_at ON booking_notes;
CREATE TRIGGER update_booking_notes_updated_at
    BEFORE UPDATE ON booking_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
