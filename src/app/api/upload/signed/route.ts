import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSignedDownloadUrl } from '@/lib/aws/s3';
import { isKeyAccessible } from '@/lib/auth/s3-ownership';

export const dynamic = 'force-dynamic';

// Returns a short-lived signed GET URL for an S3 key the signed-in user
// already has access to. Used by the wizard when pre-loading a hero from
// the gallery "Try another style" flow, and by the admin reviews UI to
// view flagged user content.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }
    if (!isKeyAccessible(key, session.user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const url = await getSignedDownloadUrl(key, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[/api/upload/signed] Error:', err);
    return NextResponse.json({ error: 'Signing failed' }, { status: 500 });
  }
}
