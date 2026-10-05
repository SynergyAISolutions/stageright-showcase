import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const client = new SESClient({
  region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  ...(process.env.APP_AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  }),
});

const FROM = process.env.SES_FROM_ADDRESS || 'no-reply@stageright.com.au';

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  try {
    await client.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: params.text, Charset: 'UTF-8' } },
      },
    }));
  } catch (err) {
    console.error('[ses] send failed', { to: params.to, subject: params.subject, err });
    throw err;
  }
}
