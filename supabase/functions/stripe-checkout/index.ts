import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'CodeCraft Studio Integration',
    version: '1.0.0',
  },
});

// Helper function to create responses with CORS headers
function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  // For 204 No Content, don't include Content-Type or body
  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { price_id, success_url, cancel_url, mode } = await req.json();

    const error = validateParameters(
      { price_id, success_url, cancel_url, mode },
      {
        cancel_url: 'string',
        price_id: 'string',
        success_url: 'string',
        mode: { values: ['payment', 'subscription'] },
      },
    );

    if (error) {
      return corsResponse({ error }, 400);
    }

    // Verify the price exists in Stripe before proceeding
    try {
      await stripe.prices.retrieve(price_id);
    } catch (stripeError: any) {
      console.error(`Invalid price ID: ${price_id}`, stripeError);
      return corsResponse({ error: `Invalid price ID: ${price_id}` }, 400);
    }

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError) {
      console.error('Authentication error:', getUserError);
      return corsResponse({ error: 'Failed to authenticate user' }, 401);
    }

    if (!user) {
      return corsResponse({ error: 'User not found' }, 404);
    }

    const { data: customer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (getCustomerError) {
      console.error('Failed to fetch customer information from the database', getCustomerError);
      return corsResponse({ error: 'Failed to fetch customer information' }, 500);
    }

    let customerId;

    /**
     * In case we don't have a mapping yet, the customer does not exist and we need to create one.
     */
    if (!customer || !customer.customer_id) {
      customerId = await createNewStripeCustomer(user);
    } else {
      // Validate that the customer exists in Stripe
      try {
        await stripe.customers.retrieve(customer.customer_id);
        customerId = customer.customer_id;
        console.log(`Using existing valid customer ${customerId}`);
      } catch (stripeError: any) {
        if (stripeError.code === 'resource_missing') {
          console.log(`Customer ${customer.customer_id} not found in Stripe, cleaning up and creating new one`);
          
          // Delete the invalid customer record from our database
          const { error: deleteError } = await supabase
            .from('stripe_customers')
            .update({ deleted_at: new Date().toISOString() })
            .eq('customer_id', customer.customer_id);

          if (deleteError) {
            console.error('Failed to mark invalid customer record as deleted:', deleteError);
          }

          // Also clean up any associated subscription records
          const { error: deleteSubError } = await supabase
            .from('stripe_subscriptions')
            .update({ deleted_at: new Date().toISOString() })
            .eq('customer_id', customer.customer_id);

          if (deleteSubError) {
            console.error('Failed to mark invalid subscription records as deleted:', deleteSubError);
          }

          // Create a new customer
          customerId = await createNewStripeCustomer(user);
        } else {
          console.error('Error validating Stripe customer:', stripeError);
          return corsResponse({ error: 'Failed to validate customer information' }, 500);
        }
      }
    }

    // Handle subscription logic only after we have a valid customer ID
    if (mode === 'subscription') {
      // Verify subscription exists for existing customer
      const { data: subscription, error: getSubscriptionError } = await supabase
        .from('stripe_subscriptions')
        .select('status, price_id')
        .eq('customer_id', customerId)
        .is('deleted_at', null)
        .maybeSingle();

      if (getSubscriptionError) {
        console.error('Failed to fetch subscription information from the database', getSubscriptionError);
        return corsResponse({ error: 'Failed to fetch subscription information' }, 500);
      }

      if (!subscription) {
        // Create subscription record for existing customer if missing
        const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
          customer_id: customerId,
          status: 'not_started',
          price_id: price_id,
        });

        if (createSubscriptionError) {
          console.error('Failed to create subscription record for existing customer', createSubscriptionError);
          return corsResponse({ error: 'Failed to create subscription record for existing customer' }, 500);
        }
      } else if (subscription.price_id !== price_id) {
        // Update the price_id if it's different
        const { error: updateSubscriptionError } = await supabase
          .from('stripe_subscriptions')
          .update({ 
            price_id: price_id,
            updated_at: new Date().toISOString()
          })
          .eq('customer_id', customerId);

        if (updateSubscriptionError) {
          console.error('Failed to update subscription price_id', updateSubscriptionError);
          // Continue anyway, as this is not critical for checkout
        }
      }
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      mode,
      success_url,
      cancel_url,
      metadata: {
        user_id: user.id,
        price_id: price_id,
      },
    });

    console.log(`Created checkout session ${session.id} for customer ${customerId} with price ${price_id}`);

    return corsResponse({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error(`Checkout error: ${error.message}`);
    return corsResponse({ error: error.message }, 500);
  }
});

async function createNewStripeCustomer(user: any): Promise<string> {
  const newCustomer = await stripe.customers.create({
    email: user.email,
    metadata: {
      userId: user.id,
    },
  });

  console.log(`Created new Stripe customer ${newCustomer.id} for user ${user.id}`);

  const { error: createCustomerError } = await supabase.from('stripe_customers').insert({
    user_id: user.id,
    customer_id: newCustomer.id,
  });

  if (createCustomerError) {
    console.error('Failed to save customer information in the database', createCustomerError);

    // Try to clean up the Stripe customer
    try {
      await stripe.customers.del(newCustomer.id);
    } catch (deleteError) {
      console.error('Failed to clean up after customer mapping error:', deleteError);
    }

    throw new Error('Failed to create customer mapping');
  }

  return newCustomer.id;
}

type ExpectedType = 'string' | { values: string[] };
type Expectations<T> = { [K in keyof T]: ExpectedType };

function validateParameters<T extends Record<string, any>>(values: T, expected: Expectations<T>): string | undefined {
  for (const parameter in values) {
    const expectation = expected[parameter];
    const value = values[parameter];

    if (expectation === 'string') {
      if (value == null) {
        return `Missing required parameter ${parameter}`;
      }
      if (typeof value !== 'string') {
        return `Expected parameter ${parameter} to be a string got ${JSON.stringify(value)}`;
      }
    } else {
      if (!expectation.values.includes(value)) {
        return `Expected parameter ${parameter} to be one of ${expectation.values.join(', ')}`;
      }
    }
  }

  return undefined;
}