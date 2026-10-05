'use client';

import { useState, useEffect, useCallback } from 'react';

interface AuthUser {
  sub: string;
  email: string;
  name: string;
  plan?: string;
  creditsRemaining?: number;
  onboardingCompletedAt?: string | null;
  hasStripeCustomer?: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return { user, loading, logout, refresh: checkAuth };
}
