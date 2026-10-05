/**
 * Singleton Stripe SDK client. Server-only — never import from a 'use client'
 * file (env.STRIPE_SECRET_KEY would throw and the secret would otherwise risk
 * shipping to the browser bundle).
 */
import Stripe from 'stripe';
import { env } from '@/env';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });
  return _stripe;
}
