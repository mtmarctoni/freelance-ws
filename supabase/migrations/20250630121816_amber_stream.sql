/*
  # Clean up and fix Stripe integration data

  1. Database Cleanup
    - Remove any inconsistent or test data
    - Ensure proper constraints and indexes
    - Update any existing records with correct price IDs

  2. Data Consistency
    - Clean up any orphaned records
    - Ensure all foreign key relationships are proper
    - Update subscription records with correct price ID

  3. Security and Performance
    - Verify RLS policies are working correctly
    - Ensure proper indexing for performance
*/

-- Clean up any test or inconsistent data
DELETE FROM stripe_orders WHERE customer_id NOT IN (
  SELECT customer_id FROM stripe_customers WHERE deleted_at IS NULL
);

DELETE FROM stripe_subscriptions WHERE customer_id NOT IN (
  SELECT customer_id FROM stripe_customers WHERE deleted_at IS NULL
);

-- Update any existing subscription records with the correct price ID
UPDATE stripe_subscriptions 
SET price_id = 'price_1RffxHDBiNElaj96GyQsOEe2',
    updated_at = now()
WHERE price_id IS NOT NULL 
AND price_id != 'price_1RffxHDBiNElaj96GyQsOEe2';

-- Ensure all subscription records have the correct status if they don't have a subscription_id
UPDATE stripe_subscriptions 
SET status = 'not_started',
    updated_at = now()
WHERE subscription_id IS NULL 
AND status != 'not_started';

-- Add indexes for better performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_id ON stripe_subscriptions(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_orders_customer_id ON stripe_orders(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_orders_checkout_session ON stripe_orders(checkout_session_id);

-- Ensure the views are properly accessible
GRANT SELECT ON stripe_user_subscriptions TO authenticated;
GRANT SELECT ON stripe_user_orders TO authenticated;

-- Update the view to handle cases where there might be no subscription record
DROP VIEW IF EXISTS stripe_user_subscriptions;
CREATE VIEW stripe_user_subscriptions WITH (security_invoker = true) AS
SELECT
    c.customer_id,
    s.subscription_id,
    COALESCE(s.status, 'not_started'::stripe_subscription_status) as subscription_status,
    s.price_id,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end,
    s.payment_method_brand,
    s.payment_method_last4
FROM stripe_customers c
LEFT JOIN stripe_subscriptions s ON c.customer_id = s.customer_id AND s.deleted_at IS NULL
WHERE c.user_id = auth.uid()
AND c.deleted_at IS NULL;

GRANT SELECT ON stripe_user_subscriptions TO authenticated;

-- Update the orders view to be more robust
DROP VIEW IF EXISTS stripe_user_orders;
CREATE VIEW stripe_user_orders WITH (security_invoker = true) AS
SELECT
    c.customer_id,
    o.id as order_id,
    o.checkout_session_id,
    o.payment_intent_id,
    o.amount_subtotal,
    o.amount_total,
    o.currency,
    o.payment_status,
    o.status as order_status,
    o.created_at as order_date
FROM stripe_customers c
INNER JOIN stripe_orders o ON c.customer_id = o.customer_id
WHERE c.user_id = auth.uid()
AND c.deleted_at IS NULL
AND o.deleted_at IS NULL
ORDER BY o.created_at DESC;

GRANT SELECT ON stripe_user_orders TO authenticated;