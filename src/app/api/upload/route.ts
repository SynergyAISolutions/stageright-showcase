import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadToS3, getS3Key } from '@/lib/aws/s3';
import { getSession } from '@/lib/auth/session';
import { ulid } from 'ulid';

export const dynamic = 'force-dynamic';

// ~25MB base64 cap (~18MB binary). Client compresses to <2MB in practice.
const MAX_BASE64_LEN = 25 * 1024 * 1024;

const requestSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_BASE64_LEN),
  imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 },
      );
    }

    const { imageBase64, imageMimeType } = parsed.data;
    const id = ulid();
    const ext = imageMimeType === 'image/png' ? 'png' : 'jpg';
    const s3Key = getS3Key(session.user.id, 'originals', id, `original.${ext}`);
    const buffer = Buffer.from(imageBase64, 'base64');
    await uploadToS3(s3Key, buffer, imageMimeType);

    return NextResponse.json({ s3Key });
  } catch (err) {
    console.error('[/api/upload] Error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
