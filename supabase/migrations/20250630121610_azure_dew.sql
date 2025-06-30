/*
  # Update Stripe Price ID

  1. Updates
    - Update any existing records in stripe_subscriptions table with the correct price_id
    - This ensures the database matches the current Stripe configuration

  2. Notes
    - This migration updates the price_id from any old values to the current correct one
    - Safe to run multiple times (idempotent)
*/

-- Update any existing subscription records with the correct price ID
UPDATE stripe_subscriptions 
SET price_id = 'price_1RffxHDBiNElaj96GyQsOEe2'
WHERE price_id IS NOT NULL 
AND price_id != 'price_1RffxHDBiNElaj96GyQsOEe2';

-- If there are any records with the old price ID, this will update them
-- This is safe to run even if no records exist or need updating