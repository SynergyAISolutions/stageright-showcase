/**
 * Server-only Stripe price-ID lookup for the credit pack catalog.
 *
 * Kept separate from `./products.ts` so the client-safe catalog can be
 * imported by client components without leaking the server-only env getter
 * into the browser bundle.
 */
import { env } from '@/env';
import type { PackId } from './products';

export function getPackPriceId(packId: PackId): string {
  switch (packId) {
    case 'starter':
      return env.STRIPE_PRICE_STARTER;
    case 'plus':
      return env.STRIPE_PRICE_PLUS;
    case 'pro':
      return env.STRIPE_PRICE_PRO;
    case 'bulk':
      return env.STRIPE_PRICE_BULK;
  }
}
