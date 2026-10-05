/**
 * Server-side host detection.
 *
 * For v1 the only signal is the `sr_host` cookie set by the (future) TWA
 * wrapper on first launch. Today no wrapper exists, the cookie never gets
 * set, and getServerHostContext() always returns 'web'.
 *
 * Server-only — uses next/headers. Never import from a 'use client' file.
 */
import { cookies } from 'next/headers';

export type HostContext = 'web' | 'twa';

export function getServerHostContext(): HostContext {
  const c = cookies().get('sr_host');
  return c?.value === 'twa' ? 'twa' : 'web';
}

export function isWebPaymentAllowedServer(): boolean {
  return getServerHostContext() === 'web';
}
