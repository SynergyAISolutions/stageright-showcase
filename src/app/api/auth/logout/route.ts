import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out' });

  response.cookies.set('sr_access_token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sr_id_token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sr_refresh_token', '', { maxAge: 0, path: '/' });

  return response;
}
