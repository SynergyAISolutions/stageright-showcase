import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { listCompareRunsForUser } from '@/lib/db/compare-runs';
import { getSignedDownloadUrl } from '@/lib/aws/s3';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  }
  if (!ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const runs = await listCompareRunsForUser(session.user.id, 50);
    // Generate signed URLs for hero thumbnails (1h TTL is plenty for a list view).
    const withThumbs = await Promise.all(runs.map(async (r) => ({
      runId: r.runId,
      createdAt: r.createdAt,
      heroSignedUrl: await getSignedDownloadUrl(r.heroS3Key, 3600).catch(() => null),
      roomTypes: r.roomTypes,
      styles: r.styles,
      jobCount: r.jobIds.length,
    })));
    return NextResponse.json({ runs: withThumbs });
  } catch (err) {
    console.error('[/api/admin/compare/runs] Error:', err);
    return NextResponse.json({ error: 'Failed to load runs' }, { status: 500 });
  }
}
