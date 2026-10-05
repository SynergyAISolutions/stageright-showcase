import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { updateOnboardingFields } from '@/lib/db/users';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    role: z
      .enum(['solo-agent', 'agency', 'photographer', 'property-manager', 'listing-my-own'])
      .optional(),
    listingsPerMonth: z.enum(['0-2', '3-5', '6-10', '11+']).optional(),
    listingIntent: z.enum(['sell', 'lease']).optional(),
    propertyType: z.enum(['residential', 'commercial']).optional(),
  })
  .refine(
    (v) =>
      v.role !== undefined ||
      v.listingsPerMonth !== undefined ||
      v.listingIntent !== undefined ||
      v.propertyType !== undefined,
    { message: 'At least one onboarding field is required' },
  );

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await updateOnboardingFields(session.user.id, parsed.data);
  return NextResponse.json({ success: true });
}
