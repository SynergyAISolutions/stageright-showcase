'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ListingsGrid } from '@/components/dashboard/listings-grid';
import { AppHeader } from '@/components/layout/app-header';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && !user.onboardingCompletedAt) {
      router.replace('/onboarding');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[100dvh] bg-sr-cream flex items-center justify-center">
        <div className="size-8 border-2 border-sr-terra border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = user.name?.split(' ')[0] || 'there';

  return (
    <div className="h-[100dvh] bg-sr-cream flex flex-col overflow-hidden">
      <AppHeader />
      <main className="flex-1 min-h-0 mx-auto max-w-6xl w-full px-5 sm:px-8 py-4 sm:py-6 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 min-h-0 flex flex-col"
        >
          {/* leading-[1.25] guards against descender-clipping on first names
              with g/p/y/j (e.g. 'Greg', 'Jenny'). */}
          <h1 className="font-display text-[22px] sm:text-3xl lg:text-[32px] leading-[1.25] tracking-[-0.02em] text-sr-ink mb-3 sm:mb-4 font-normal flex-shrink-0">
            Hello, <em className="text-sr-terra italic">{firstName}</em>.
          </h1>

          <div className="flex-1 min-h-0 flex flex-col">
            <ListingsGrid />
          </div>
        </motion.div>
      </main>
    </div>
  );
}
