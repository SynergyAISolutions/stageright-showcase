import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '@/lib/aws/s3';

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

/**
 * Public-readable URL for an S3 image, suitable for embedding in the public
 * landing page. Returns a signed URL with a 7-day TTL — long enough that
 * ISR-cached landing renders don't expire mid-session, short enough that a
 * deleted/rotated key invalidates within a week. If/when CloudFront with OAI
 * is wired up for the bucket, swap this implementation to return
 * `https://<distribution>/<key>` directly.
 */
export async function getPublicImageUrl(
  s3Key: string | undefined,
): Promise<string | null> {
  if (!s3Key) return null;
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
    { expiresIn: SEVEN_DAYS_SECONDS },
  );
}
