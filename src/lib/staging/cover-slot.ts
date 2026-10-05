import type { VariantSlot } from '@/types';

interface VariantStatus {
  slot: VariantSlot;
  status: 'pending' | 'running' | 'done' | 'error' | 'failed_after_retry';
}

/**
 * Default cover slot rule (per spec):
 *   - if slot 3 succeeded: 3
 *   - else if slot 2 succeeded: 2
 *   - else if slot 1 succeeded: 1
 *   - else: highest slot regardless of status (falls back to 3 / 2 / 1)
 *
 * Caller supplies an override (`coverSlot` set on the BatchSubJob); this
 * helper is only called when no override exists.
 */
export function defaultCoverSlot(variants: VariantStatus[]): VariantSlot {
  for (const slot of [3, 2, 1] as const) {
    const v = variants.find((x) => x.slot === slot);
    if (v && v.status === 'done') return slot as VariantSlot;
  }
  return (variants.find((v) => v.slot === 3) ? 3 : variants.find((v) => v.slot === 2) ? 2 : 1) as VariantSlot;
}
