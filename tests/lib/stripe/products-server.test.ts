import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
  process.env.STRIPE_PRICE_PLUS = 'price_plus_test';
  process.env.STRIPE_PRICE_PRO = 'price_pro_test';
  process.env.STRIPE_PRICE_BULK = 'price_bulk_test';
});

describe('getPackPriceId', () => {
  it('returns the env-configured price ID for each pack', async () => {
    const { getPackPriceId } = await import('@/lib/stripe/products-server');
    expect(getPackPriceId('starter')).toBe('price_starter_test');
    expect(getPackPriceId('plus')).toBe('price_plus_test');
    expect(getPackPriceId('pro')).toBe('price_pro_test');
    expect(getPackPriceId('bulk')).toBe('price_bulk_test');
  });
});
