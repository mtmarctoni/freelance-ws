export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
  price: number;
  currency: string;
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_STRAwZoCeFBz5P',
    priceId: 'price_1RYUINRgD4FRsmURTKY4JGrb',
    name: 'Website Strategy Consultation',
    description: 'A comprehensive 60-minute consultation designed for entrepreneurs, startups, and small businesses who want expert guidance before investing in their web project. This consultation helps clients make informed decisions about their website or web application development.',
    mode: 'payment',
    price: 97.00,
    currency: 'eur'
  }
];

export function getProductById(id: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.id === id);
}

export function getProductByPriceId(priceId: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.priceId === priceId);
}