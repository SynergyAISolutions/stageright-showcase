import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookiesGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: cookiesGet }),
}));

beforeEach(() => {
  cookiesGet.mockReset();
});

describe('host-gate-server', () => {
  it('returns "web" when no sr_host cookie is set', async () => {
    cookiesGet.mockReturnValue(undefined);
    const { getServerHostContext, isWebPaymentAllowedServer } = await import('@/lib/billing/host-gate-server');
    expect(getServerHostContext()).toBe('web');
    expect(isWebPaymentAllowedServer()).toBe(true);
  });

  it('returns "twa" when sr_host=twa cookie is set', async () => {
    cookiesGet.mockReturnValue({ value: 'twa' });
    const { getServerHostContext, isWebPaymentAllowedServer } = await import('@/lib/billing/host-gate-server');
    expect(getServerHostContext()).toBe('twa');
    expect(isWebPaymentAllowedServer()).toBe(false);
  });

  it('returns "web" for any other cookie value', async () => {
    cookiesGet.mockReturnValue({ value: 'something-else' });
    const { getServerHostContext, isWebPaymentAllowedServer } = await import('@/lib/billing/host-gate-server');
    expect(getServerHostContext()).toBe('web');
    expect(isWebPaymentAllowedServer()).toBe(true);
  });
});
