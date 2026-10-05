import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const constructEvent = vi.fn();
vi.mock('@/lib/stripe/server', () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
  }),
}));

vi.mock('@/env', () => ({
  env: { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
}));

const addCreditsForStripeEvent = vi.fn();
const getUserById = vi.fn();
const updateUser = vi.fn();
vi.mock('@/lib/db/users', () => ({
  addCreditsForStripeEvent: (...args: unknown[]) => addCreditsForStripeEvent(...args),
  getUserById: (...args: unknown[]) => getUserById(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

function makeRequest(body: string, sig?: string) {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: sig ? { 'stripe-signature': sig } : {},
    body,
  });
}

beforeEach(() => {
  constructEvent.mockReset();
  addCreditsForStripeEvent.mockReset();
  getUserById.mockReset();
  updateUser.mockReset();
});

describe('POST /api/webhooks/stripe', () => {
  it('400 when stripe-signature header is missing', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('400 when signature verification throws', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const res = await POST(makeRequest('{}', 'sig_bad'));
    expect(res.status).toBe(400);
  });

  it('200 and ignores unrelated event types', async () => {
    constructEvent.mockReturnValue({ id: 'evt_1', type: 'invoice.paid' });
    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(200);
    expect(addCreditsForStripeEvent).not.toHaveBeenCalled();
  });

  it('200 deduped when addCreditsForStripeEvent returns alreadyProcessed', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u1', credits: '50', packId: 'plus' } } },
    });
    addCreditsForStripeEvent.mockResolvedValue({ alreadyProcessed: true });
    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduped).toBe(true);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('grants credits, persists stripeCustomerId on success', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_abc',
          metadata: { userId: 'u1', credits: '50', packId: 'plus' },
        },
      },
    });
    addCreditsForStripeEvent.mockResolvedValue({ alreadyProcessed: false });
    getUserById.mockResolvedValue({ id: 'u1', stripeCustomerId: undefined });

    const res = await POST(makeRequest('{}', 'sig_good'));

    expect(res.status).toBe(200);
    expect(addCreditsForStripeEvent).toHaveBeenCalledWith({
      userId: 'u1',
      amount: 50,
      stripeEventId: 'evt_2',
    });
    expect(updateUser).toHaveBeenCalledWith('u1', { stripeCustomerId: 'cus_abc' });
  });

  it('skips updateUser when stripeCustomerId already on record', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_abc',
          metadata: { userId: 'u1', credits: '50', packId: 'plus' },
        },
      },
    });
    addCreditsForStripeEvent.mockResolvedValue({ alreadyProcessed: false });
    getUserById.mockResolvedValue({ id: 'u1', stripeCustomerId: 'cus_abc' });

    const res = await POST(makeRequest('{}', 'sig_good'));

    expect(res.status).toBe(200);
    expect(addCreditsForStripeEvent).toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('400 when session.metadata is missing required fields', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_4',
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u1' } } }, // no credits/packId
    });

    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(400);
    expect(addCreditsForStripeEvent).not.toHaveBeenCalled();
  });

  it('400 when metadata.credits does not match pack catalog (defence-in-depth)', async () => {
    // Real pack 'plus' is 50 credits per src/lib/stripe/products.ts. Tampered
    // metadata claims 99999.
    constructEvent.mockReturnValue({
      id: 'evt_5',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'u1', credits: '99999', packId: 'plus' },
        },
      },
    });

    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(400);
    expect(addCreditsForStripeEvent).not.toHaveBeenCalled();
  });

  it('400 when metadata.packId is unknown', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_6',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'u1', credits: '50', packId: 'fake_pack' },
        },
      },
    });

    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(400);
    expect(addCreditsForStripeEvent).not.toHaveBeenCalled();
  });
});
