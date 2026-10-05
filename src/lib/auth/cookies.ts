import type { NextResponse } from 'next/server';

export interface AuthTokens {
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
  ExpiresIn?: number;
}

/**
 * Sets the three StageRight auth cookies on a response. The single source of
 * truth for cookie names and options: login, confirm and reset-password all
 * call this.
 */
export function setAuthCookies(response: NextResponse, tokens: AuthTokens): void {
  response.cookies.set('sr_access_token', tokens.AccessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: tokens.ExpiresIn || 3600,
    path: '/',
  });

  response.cookies.set('sr_id_token', tokens.IdToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: tokens.ExpiresIn || 3600,
    path: '/',
  });

  response.cookies.set('sr_refresh_token', tokens.RefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
}
