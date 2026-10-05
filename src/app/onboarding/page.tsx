import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getUserById } from '@/lib/db/users';
import { ADMIN_EMAILS } from '@/types';
import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getSession();

  // Anonymous users walk the cached onboarding flow with no DB record.
  // They sign up at the end via the in-flow SignupScreen, which flushes
  // their held answers to /api/onboarding/progress before redirecting
  // to /dashboard.
  if (!session) {
    return (
      <OnboardingFlow
        userName=""
        initialRole={null}
        initialListingsPerMonth={null}
        isAuthenticated={false}
      />
    );
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return (
      <OnboardingFlow
        userName=""
        initialRole={null}
        initialListingsPerMonth={null}
        isAuthenticated={false}
      />
    );
  }

  // Admin emails always re-walk the flow — used for QA / dogfooding the
  // onboarding experience. They start fresh every visit (no pre-selected
  // role / volume) so they feel exactly what a new user does.
  const isAdmin = ADMIN_EMAILS.includes(user.email);

  if (user.onboardingCompletedAt && !isAdmin) redirect('/dashboard');

  return (
    <OnboardingFlow
      userName={user.name}
      initialRole={isAdmin ? null : (user.role ?? null)}
      initialListingsPerMonth={isAdmin ? null : (user.listingsPerMonth ?? null)}
      isAuthenticated
    />
  );
}
