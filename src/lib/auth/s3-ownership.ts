import { ADMIN_EMAILS } from '@/types';
import type { User } from '@/types';

/**
 * Returns true if the given S3 key is allowed for this user.
 * - Admins can access any key.
 * - Owners can access keys under their tenant prefix.
 * - Legacy tolerance: keys under tenants/anonymous/ remain readable for old
 *   objects written before the per-user prefix migration. New uploads go
 *   straight to tenants/{userId}/.
 */
export function isKeyAccessible(key: string, user: Pick<User, 'id' | 'email'>): boolean {
  if (!key) return false;
  if (ADMIN_EMAILS.includes(user.email)) return true;
  if (key.startsWith(`tenants/${user.id}/`)) return true;
  if (key.startsWith('tenants/anonymous/')) return true;
  return false;
}

export function assertKeysAccessible(
  keys: (string | undefined)[],
  user: Pick<User, 'id' | 'email'>,
): { ok: true } | { ok: false; badKey: string } {
  for (const k of keys) {
    if (!k) continue;
    if (!isKeyAccessible(k, user)) return { ok: false, badKey: k };
  }
  return { ok: true };
}
