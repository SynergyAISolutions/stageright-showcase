/**
 * Admin-only endpoint for running the SAM 2 structural validator against a
 * completed staging session. Not exposed to regular users — this is Tara's
 * calibration tool: run it on real stagings, see what scores come back, decide
 * what threshold actually matches a human eye before wiring auto-regenerate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { downloadFromS3 } from '@/lib/aws/s3';
import { validateStructuralPreservation } from '@/lib/ai/validate';

export const dynamic = 'force-dynamic';

// Caller MUST supply the exact image pair they want compared. This removes any
// ambiguity about "which staged variant did the validator actually look at?"
// — especially important when calling from the gallery, where one upload can
// have many variants.
const requestSchema = z.object({
  originalS3Key: z.string().min(1),
  stagedS3Key: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'originalS3Key and stagedS3Key required' }, { status: 400 });
  }
  const { originalS3Key, stagedS3Key } = parsed.data;

  try {
    const [originalBuffer, stagedBuffer] = await Promise.all([
      downloadFromS3(originalS3Key),
      downloadFromS3(stagedS3Key),
    ]);

    const result = await validateStructuralPreservation(
      originalBuffer,
      'image/jpeg', // hero photos are always JPEG after compression
      stagedBuffer,
    );

    return NextResponse.json({
      ...result,
      originalS3Key,
      stagedS3Key,
    });
  } catch (err) {
    console.error('[/api/admin/validate-structure] error', err);
    const message = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
