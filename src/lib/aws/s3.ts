/**
 * S3 helpers — matches content-producer/src/lib/aws/s3.ts
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3Client = new S3Client({
  region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  ...(process.env.APP_AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  }),
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'stageright-images';

/**
 * Upload a buffer to S3.
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/**
 * Generate a time-limited signed download URL.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    { expiresIn },
  );
}

/**
 * Download a file from S3 as a Buffer.
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
  );
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Delete an object from S3.
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
  );
}

/**
 * Build a tenant-scoped S3 key.
 * Pattern: tenants/{userId}/{type}/{entityId}/{filename}
 */
export function getS3Key(
  userId: string,
  type: 'originals' | 'staged' | 'validated',
  jobId: string,
  filename: string,
): string {
  return `tenants/${userId}/${type}/${jobId}/${filename}`;
}
