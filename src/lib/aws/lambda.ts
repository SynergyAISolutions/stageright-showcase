/**
 * Lambda invocation helper — matches content-producer pattern.
 */
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({
  region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  ...(process.env.APP_AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  }),
});

const STAGING_WORKER = process.env.STAGING_LAMBDA_NAME || 'stageright-staging-worker';

export async function invokeStagingWorker(payload: {
  jobId: string;
  action: 'stage' | 'edit';
  params: Record<string, unknown>;
  /**
   * Optional batch identifier — when set, the Lambda worker will propagate
   * completion/failure up to the BATCH_JOB record and refund credits on error.
   * Single-staging call sites leave this undefined (no behaviour change).
   */
  batchId?: string;
}): Promise<void> {
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: STAGING_WORKER,
      InvocationType: 'Event', // Async — don't wait for response
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
}
