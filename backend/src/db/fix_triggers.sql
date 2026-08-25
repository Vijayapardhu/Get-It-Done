CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Travel fees trigger
DROP TRIGGER IF EXISTS update_travel_fees_updated_at ON travel_fees;
CREATE TRIGGER update_travel_fees_updated_at
  BEFORE UPDATE ON travel_fees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
-- Notification templates trigger
DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
-- Pricing rules trigger
DROP TRIGGER IF EXISTS update_pricing_rules_updated_at ON pricing_rules;
CREATE TRIGGER update_pricing_rules_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();