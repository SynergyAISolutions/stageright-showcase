import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  process.env.STRIPE_PRICE_STARTER = 'price_starter';
  process.env.STRIPE_PRICE_PLUS = 'price_plus';
  process.env.STRIPE_PRICE_PRO = 'price_pro';
  process.env.STRIPE_PRICE_BULK = 'price_bulk';
});

describe('PACKS catalog', () => {
  it('contains exactly four packs in the locked-pricing order', async () => {
    const { PACKS, PACK_ORDER } = await import('@/lib/stripe/products');
    expect(PACK_ORDER).toEqual(['starter', 'plus', 'pro', 'bulk']);
    expect(Object.keys(PACKS).sort()).toEqual(['bulk', 'plus', 'pro', 'starter']);
  });

  it('matches the locked-pricing credits-and-AUD values from CLAUDE.md', async () => {
    const { PACKS } = await import('@/lib/stripe/products');
    expect(PACKS.starter).toMatchObject({ credits: 20, priceAud: 24 });
    expect(PACKS.plus).toMatchObject({ credits: 50, priceAud: 49 });
    expect(PACKS.pro).toMatchObject({ credits: 125, priceAud: 99 });
    expect(PACKS.bulk).toMatchObject({ credits: 300, priceAud: 219 });
  });

  it('getPack returns the pack for a valid id, null otherwise', async () => {
    const { getPack } = await import('@/lib/stripe/products');
    expect(getPack('plus')?.credits).toBe(50);
    expect(getPack('nonsense')).toBeNull();
    expect(getPack('')).toBeNull();
  });
});
