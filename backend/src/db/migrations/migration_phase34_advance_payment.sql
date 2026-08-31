-- Migration: Advance Payment & Two-Stage Payment Flow
-- Supports: advance payment at booking, final payment after completion

-- Add payment tracking columns to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_stage TEXT DEFAULT 'pending' CHECK (payment_stage IN ('pending', 'advance_paid', 'fully_paid', 'refunded'));

-- Add index for payment stage queries
CREATE INDEX IF NOT EXISTS bookings_payment_stage_idx ON bookings(payment_stage);

-- Add payment_type to payment_orders to distinguish advance vs final
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'full' CHECK (payment_type IN ('advance', 'final', 'full')),
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id);

-- Add index for payment type lookups
CREATE INDEX IF NOT EXISTS payment_orders_type_idx ON payment_orders(payment_type, booking_id);

-- Add advance_payment_id to bookings to track the advance payment
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS advance_payment_id UUID REFERENCES payment_orders(id);

-- Function to calculate advance amount (20% of price)
CREATE OR REPLACE FUNCTION calculate_advance_amount(booking_price NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN ROUND((booking_price * 0.20)::numeric, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to auto-set advance and balance on booking insert/update
CREATE OR REPLACE FUNCTION set_booking_payment_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.price IS NOT NULL AND NEW.price > 0 THEN
    NEW.advance_amount := calculate_advance_amount(NEW.price);
    NEW.balance_due := NEW.price - NEW.advance_amount;
    
    -- If no payment yet, set stage to pending
    IF NEW.payment_stage IS NULL OR NEW.payment_stage = 'pending' THEN
      NEW.payment_stage := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate advance/balance
DROP TRIGGER IF EXISTS booking_payment_defaults ON bookings;
CREATE TRIGGER booking_payment_defaults
  BEFORE INSERT OR UPDATE OF price ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_booking_payment_defaults();

-- Function to handle advance payment capture
CREATE OR REPLACE FUNCTION capture_advance_payment(booking_id UUID, payment_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  UPDATE bookings 
  SET advance_paid = TRUE, 
      advance_payment_id = payment_order_id,
      payment_stage = 'advance_paid',
      updated_at = now()
  WHERE id = booking_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to handle final payment capture after completion
CREATE OR REPLACE FUNCTION capture_final_payment(booking_id UUID, payment_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Can only pay final if advance was paid
  IF NOT v_booking.advance_paid THEN
    RAISE EXCEPTION 'Advance payment must be completed first';
  END IF;
  
  UPDATE bookings 
  SET final_paid = TRUE,
      payment_stage = 'fully_paid',
      updated_at = now()
  WHERE id = booking_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to refund advance on cancellation
CREATE OR REPLACE FUNCTION refund_advance_on_cancellation(booking_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Only refund if advance was paid but final wasn't
  IF v_booking.advance_paid AND NOT v_booking.final_paid THEN
    UPDATE bookings 
    SET payment_stage = 'refunded',
        updated_at = now()
    WHERE id = booking_id;
    
    -- Create refund record
    INSERT INTO payment_refunds (id, payment_order_id, amount, reason, status, processed_at)
    VALUES (gen_random_uuid(), v_booking.advance_payment_id, v_booking.advance_amount, 'booking_cancelled', 'pending', now());
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
