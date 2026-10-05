import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getPublicImageUrl } from '@/lib/aws/image-urls';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });
  const signed = await getPublicImageUrl(key);
  if (!signed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.redirect(signed, 307);
}
