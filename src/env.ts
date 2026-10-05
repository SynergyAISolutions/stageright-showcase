/**
 * Centralised environment variable access.
 * Pattern: content-producer/src/env.ts
 *
 * Required vars throw at access time; optional vars return defaults.
 */

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnvVar(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback;
}

export const env = {
  // --- AWS ---
  get AWS_REGION() {
    return getOptionalEnvVar('APP_AWS_REGION') || getOptionalEnvVar('AWS_REGION', 'ap-southeast-2')!;
  },
  get AWS_ACCESS_KEY_ID() {
    return getOptionalEnvVar('APP_AWS_ACCESS_KEY_ID') || getRequiredEnvVar('AWS_ACCESS_KEY_ID');
  },
  get AWS_SECRET_ACCESS_KEY() {
    return getOptionalEnvVar('APP_AWS_SECRET_ACCESS_KEY') || getRequiredEnvVar('AWS_SECRET_ACCESS_KEY');
  },

  // --- DynamoDB ---
  get DYNAMODB_TABLE_NAME() {
    return getOptionalEnvVar('DYNAMODB_TABLE_NAME', 'stageright')!;
  },

  // --- S3 ---
  get S3_BUCKET_NAME() {
    return getOptionalEnvVar('S3_BUCKET_NAME', 'stageright-images')!;
  },

  // --- Cognito ---
  get COGNITO_USER_POOL_ID() {
    return getRequiredEnvVar('COGNITO_USER_POOL_ID');
  },
  get COGNITO_CLIENT_ID() {
    return getRequiredEnvVar('COGNITO_CLIENT_ID');
  },

  // --- Gemini ---
  get GEMINI_API_KEY() {
    return getRequiredEnvVar('GEMINI_API_KEY');
  },

  // --- Replicate ---
  get REPLICATE_API_TOKEN() {
    return getOptionalEnvVar('REPLICATE_API_TOKEN');
  },

  // --- Stripe ---
  // Note: these getters intentionally use static dot-notation
  // (process.env.STRIPE_SECRET_KEY, not process.env[name]) so Next.js's
  // build-time env replacement inlines the values from next.config.mjs's env
  // block into the bundle. Bracket notation prevents that inlining and makes
  // these unreachable at runtime on Amplify Hosting compute, where new
  // env vars added after first deploy don't always propagate to the SSR
  // Lambda's process.env.
  get STRIPE_SECRET_KEY() {
    const v = process.env.STRIPE_SECRET_KEY;
    if (!v) throw new Error('Missing required environment variable: STRIPE_SECRET_KEY');
    return v;
  },
  get STRIPE_PUBLISHABLE_KEY() {
    const v = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!v) throw new Error('Missing required environment variable: STRIPE_PUBLISHABLE_KEY');
    return v;
  },
  get STRIPE_WEBHOOK_SECRET() {
    const v = process.env.STRIPE_WEBHOOK_SECRET;
    if (!v) throw new Error('Missing required environment variable: STRIPE_WEBHOOK_SECRET');
    return v;
  },
  get STRIPE_PRICE_STARTER() {
    const v = process.env.STRIPE_PRICE_STARTER;
    if (!v) throw new Error('Missing required environment variable: STRIPE_PRICE_STARTER');
    return v;
  },
  get STRIPE_PRICE_PLUS() {
    const v = process.env.STRIPE_PRICE_PLUS;
    if (!v) throw new Error('Missing required environment variable: STRIPE_PRICE_PLUS');
    return v;
  },
  get STRIPE_PRICE_PRO() {
    const v = process.env.STRIPE_PRICE_PRO;
    if (!v) throw new Error('Missing required environment variable: STRIPE_PRICE_PRO');
    return v;
  },
  get STRIPE_PRICE_BULK() {
    const v = process.env.STRIPE_PRICE_BULK;
    if (!v) throw new Error('Missing required environment variable: STRIPE_PRICE_BULK');
    return v;
  },

  // --- App ---
  // Static dot-notation so Next.js inlines the build-time value into the
  // bundle. Bracket notation falls back to localhost at runtime on Amplify
  // because process.env.NEXT_PUBLIC_APP_URL isn't in the runtime container.
  get NEXT_PUBLIC_APP_URL() {
    return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  },
};
