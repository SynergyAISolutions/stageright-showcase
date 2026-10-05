import { sendEmail } from '@/lib/aws/ses';
import type { FlagReview } from '@/types';

const ADMIN_NOTIFY = process.env.FLAG_REVIEW_ADMIN_EMAIL || 'taraferguson.business@gmail.com';
const REVIEW_URL = 'https://stageright.aiwave.com.au/admin/reviews';

export async function sendAdminNewFlagEmail(review: FlagReview): Promise<void> {
  await sendEmail({
    to: ADMIN_NOTIFY,
    subject: `New flagged staging — ${review.userEmail}`,
    text: [
      'A user has flagged a staging for review.',
      '',
      `User: ${review.userEmail}`,
      `Room: ${review.roomTypes.join(', ')}`,
      `Style: ${review.style}`,
      `Note: ${review.userNote || '(none)'}`,
      '',
      `Review it: ${REVIEW_URL}`,
    ].join('\n'),
  });
}

export async function sendUserAcceptedEmail(userEmail: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: 'We have added a credit back to your account',
    text: [
      'Thanks for flagging that staging.',
      '',
      'We have reviewed it and agreed — the structure did not look right. We have added 1 credit back to your account so you can try again.',
      '',
      '— The StageRight team',
    ].join('\n'),
  });
}

export async function sendUserDeclinedEmail(userEmail: string, adminNote?: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: 'Update on your flagged staging',
    text: [
      'Thanks for flagging that staging.',
      '',
      'We have reviewed the original and the output and, on balance, we do not think the structure changed significantly.',
      adminNote ? `\n${adminNote}\n` : '',
      'If you are still not happy, reach out and we will talk it through.',
      '',
      '— The StageRight team',
    ].join('\n'),
  });
}
