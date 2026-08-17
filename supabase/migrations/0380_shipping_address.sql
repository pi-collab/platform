-- Add shipping_address column to deals table
-- Creator submits their address so the brand can ship the product kit
ALTER TABLE deals ADD COLUMN IF NOT EXISTS shipping_address text;
