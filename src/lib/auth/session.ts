/**
 * Server-side auth helper — get current user from cookies.
 * Auto-refreshes expired access tokens using the refresh token.
 */
import { cookies } from 'next/headers';
import { getCurrentUser, refreshTokens } from '@/lib/aws/cognito';
import { getUserById, createUser } from '@/lib/db/users';
import type { User } from '@/types';

export async function getSession(): Promise<{ user: User } | null> {
  try {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('sr_access_token')?.value;
    const refreshToken = cookieStore.get('sr_refresh_token')?.value;

    if (!accessToken && !refreshToken) return null;

    // Try current access token first
    if (accessToken) {
      try {
        return await getUserFromToken(accessToken);
      } catch {
        // Token might be expired — try refreshing
      }
    }

    // Try refreshing the token
    if (refreshToken) {
      try {
        const result = await refreshTokens(refreshToken);
        const newAccessToken = result.AuthenticationResult?.AccessToken;
        if (newAccessToken) {
          // Note: can't set cookies from server components in Next.js 14
          // but the token will work for this request
          return await getUserFromToken(newAccessToken);
        }
      } catch {
        // Refresh failed — user needs to log in again
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function getUserFromToken(accessToken: string): Promise<{ user: User } | null> {
  const cognitoUser = await getCurrentUser(accessToken);
  const attrs = cognitoUser.UserAttributes || [];
  const sub = attrs.find((a) => a.Name === 'sub')?.Value;
  const email = attrs.find((a) => a.Name === 'email')?.Value;
  const name = attrs.find((a) => a.Name === 'name')?.Value;

  if (!sub || !email) return null;

  let user = await getUserById(sub);
  if (!user) {
    user = await createUser({ email, name: name || email, cognitoSub: sub });
  }

  return { user };
}
