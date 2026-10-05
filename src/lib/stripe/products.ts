/**
 * Single source of truth for purchasable credit packs (client-safe shape).
 *
 * Holds catalog metadata only — no Stripe price IDs, no env access — so this
 * module can be imported by client components like `<PackTiles />` without
 * dragging server-only env vars into the browser bundle.
 *
 * For the Stripe `price_…` IDs (server-only), see `./products-server.ts`.
 *
 * The displayed price (priceAud) is what the user sees on the tile AND on
 * Stripe Checkout. The Stripe price object that backs each pack MUST be
 * configured with the same AUD amount and `tax_behavior: 'inclusive'` —
 * i.e. the user pays exactly priceAud (GST is folded in). If a price ever
 * changes: update it in Stripe (creating a new price object), swap the env
 * var pointing at the new price ID, redeploy. Do NOT mutate this file's
 * priceAud without doing the Stripe-side change.
 */

export type PackId = 'starter' | 'plus' | 'pro' | 'bulk';

export type Pack = {
  id: PackId;
  label: string;
  credits: number;
  priceAud: number;
};

export const PACKS: Record<PackId, Pack> = {
  starter: { id: 'starter', label: 'Starter', credits: 20, priceAud: 24 },
  plus:    { id: 'plus',    label: 'Plus',    credits: 50, priceAud: 49 },
  pro:     { id: 'pro',     label: 'Pro',     credits: 125, priceAud: 99 },
  bulk:    { id: 'bulk',    label: 'Bulk',    credits: 300, priceAud: 219 },
};

export function getPack(id: string): Pack | null {
  if (id === 'starter' || id === 'plus' || id === 'pro' || id === 'bulk') {
    return PACKS[id];
  }
  return null;
}

export const PACK_ORDER: PackId[] = ['starter', 'plus', 'pro', 'bulk'];