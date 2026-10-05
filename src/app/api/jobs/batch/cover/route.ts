import { NextRequest, NextResponse } from 'next/server';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSession } from '@/lib/auth/session';
import { getBatchJob } from '@/lib/db/batch-jobs';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { VariantSlot } from '@/types';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    batchId?: string;
    style?: string;
    slot?: VariantSlot;
  };
  if (!body.batchId || !body.style || (body.slot !== 1 && body.slot !== 2 && body.slot !== 3)) {
    return NextResponse.json({ error: 'batchId, style, slot (1-3) required' }, { status: 400 });
  }

  const batch = await getBatchJob(body.batchId);
  if (!batch || batch.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const styleIndex = batch.subJobs.findIndex((s) => s.style === body.style);
  if (styleIndex < 0) {
    return NextResponse.json({ error: 'unknown style' }, { status: 400 });
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${body.batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${styleIndex}].coverSlot = :slot, updatedAt = :now`,
      ExpressionAttributeValues: {
        ':slot': body.slot,
        ':now': new Date().toISOString(),
      },
    }),
  );

  return NextResponse.json({ ok: true });
}
