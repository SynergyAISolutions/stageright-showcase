import { createHash } from 'node:crypto';

export function hashHeroKey(s3Key: string): string {
  return createHash('sha1').update(s3Key).digest('base64url').slice(0, 16);
}

export function findHeroByHash(heroS3Keys: string[], hash: string): string | null {
  for (const k of heroS3Keys) {
    if (hashHeroKey(k) === hash) return k;
  }
  return null;
}
