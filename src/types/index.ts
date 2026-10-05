/**
 * StageRight type definitions.
 * Single-table DynamoDB design — matches content-producer pattern.
 */

// ---------- Base entity (all DynamoDB items) ----------

export interface BaseEntity {
  pk: string;
  sk: string;
  gsi1pk?: string;
  gsi1sk?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Credits System ----------

export const CREDIT_COSTS = {
  staging_standard: 1,
  staging_triple: 1, // triple bundle: 2 credits/style, passed as units (styles × 2)
  staging_hd: 3,
  edit: 1,
  regenerate: 1,
  analysis: 0, // Free — encourages better results
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// ---------- Plans ----------

export type Plan = 'free' | 'starter' | 'professional' | 'agency' | 'admin'
  | 'lifetime_starter' | 'lifetime_pro';

export type Role =
  | 'solo-agent'
  | 'agency'
  | 'photographer'
  | 'property-manager'
  | 'listing-my-own'; // private owner / Airbnb host / private seller — both sell and lease paths

export type ListingsPerMonth = '0-2' | '3-5' | '6-10' | '11+';

// Intent + property type — collected on the new "What are you listing?" screen.
// Drives the Bombshell variant (Role × Intent) and the Upload screen copy
// (sell allows furnished input; lease must be unfurnished). Commercial routes
// to its own notice screen and skips the Volume / Bombshell / Bridge steps.
export type ListingIntent = 'sell' | 'lease';
export type PropertyType = 'residential' | 'commercial';

export interface PlanConfig {
  name: string;
  credits: number;
  priceAud: number;
  isMonthly: boolean;
  isLifetime: boolean;
  features: string[];
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    name: 'Free',
    credits: 30,
    priceAud: 0,
    isMonthly: false,
    isLifetime: false,
    features: [
      '30 credits to start',
      'Photorealistic staging',
      'Earn a free credit every 7 you spend',
    ],
  },
  starter: {
    name: 'Starter',
    credits: 35,
    priceAud: 29,
    isMonthly: true,
    isLifetime: false,
    features: [
      '35 credits per month',
      'Standard quality',
      'Download in full resolution',
      'Reference photo support',
    ],
  },
  professional: {
    name: 'Professional',
    credits: 75,
    priceAud: 49,
    isMonthly: true,
    isLifetime: false,
    features: [
      '75 credits per month',
      'Standard + HD quality',
      'Priority generation',
      'Conversational editing',
      'Before/after export',
    ],
  },
  agency: {
    name: 'Agency',
    credits: 175,
    priceAud: 99,
    isMonthly: true,
    isLifetime: false,
    features: [
      '175 credits per month',
      'Standard + HD quality',
      'Team accounts (up to 5)',
      'Analytics dashboard',
      'Priority support',
      'Bulk upload',
    ],
  },
  lifetime_starter: {
    name: 'Lifetime Starter',
    credits: 500,
    priceAud: 249,
    isMonthly: false,
    isLifetime: true,
    features: [
      '500 credits — never expire',
      'Standard quality',
      'Download in full resolution',
      'Buy top-ups anytime',
    ],
  },
  lifetime_pro: {
    name: 'Lifetime Pro',
    credits: 1200,
    priceAud: 499,
    isMonthly: false,
    isLifetime: true,
    features: [
      '1,200 credits — never expire',
      'Standard + HD quality',
      'Priority generation',
      'Conversational editing',
      'Buy top-ups anytime',
    ],
  },
  admin: {
    name: 'Admin',
    credits: Infinity,
    priceAud: 0,
    isMonthly: false,
    isLifetime: false,
    features: ['Unlimited everything'],
  },
};

export interface TopUpPack {
  id: string;
  name: string;
  credits: number;
  priceAud: number;
  perCredit: string;
}

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: 'topup_25', name: 'Small', credits: 25, priceAud: 19, perCredit: '$0.76' },
  { id: 'topup_60', name: 'Medium', credits: 60, priceAud: 39, perCredit: '$0.65' },
  { id: 'topup_150', name: 'Large', credits: 150, priceAud: 79, perCredit: '$0.53' },
];

// ---------- User ----------

export interface User extends BaseEntity {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  creditsRemaining: number;
  creditsUsedAllTime: number;
  creditResetDate?: string; // ISO date for monthly plans — when credits refresh
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  role?: Role | null;
  listingsPerMonth?: ListingsPerMonth | null;
  listingIntent?: ListingIntent | null;
  propertyType?: PropertyType | null;
  onboardingCompletedAt?: string | null;
  firstStageAt?: string | null;  // ISO timestamp; set atomically on first successful stage
  stagesCompletedTotal?: number; // monotonic counter; increments on each successful stage (batch or single). Default 0 for new/existing accounts.
  lastBonusStageCount?: number;  // stage-count value at which the last bonus was granted; exactly-once guard.
  /** ISO timestamp when the legacy-uploads migration ran. Set once, never re-run. */
  legacyMigrationCompletedAt?: string;
  /** Stripe event IDs already applied to this user's credit balance. Acts as
   *  the dedup key for `addCreditsForStripeEvent`. */
  stripeEventIds?: string[];
}

// Admin emails — unlimited access, all features
export const ADMIN_EMAILS = [
  'taraferguson.business@gmail.com',
  'tara@aiwave.com.au',
];

// ---------- Staging Providers ----------

export type StagingProvider = 'gemini' | 'openai';

export type ComparisonVariantId =
  | 'gemini-full'
  | 'openai-full-low'
  | 'openai-full-medium'
  | 'openai-full-high'
  | 'openai-lean-medium'
  | 'openai-lean-high';

export type ComparisonAnalysisMode = 'full' | 'lean-direct';
export type ComparisonPromptMode = 'hero-only' | 'spatial-ref';

export interface ProviderStageResult {
  variantId: ComparisonVariantId;
  provider: StagingProvider;
  label: string;
  modelId: string;
  analysisMode: ComparisonAnalysisMode;
  promptMode?: ComparisonPromptMode;
  quality?: 'low' | 'medium' | 'high';
  imageUrl?: string;
  s3Key?: string;
  sessionId?: string;
  error?: string;
}

export interface ComparisonResult {
  originalUrl: string;
  style: string;
  roomTypes: string[];
  activeVariant: ComparisonVariantId;
  results: Partial<Record<ComparisonVariantId, ProviderStageResult>>;
}

// ---------- Staging Job ----------

export interface StagingJob extends BaseEntity {
  id: string;
  userId: string;
  status: StagingStatus;
  style: string;
  model: 'nano-banana-2' | 'nano-banana-pro';
  originalS3Key: string;
  stagedS3Key?: string;
  validationScore?: number;
  validationPassed?: boolean;
  attempt: number;
  maxAttempts: number;
  chatHistory?: ChatTurn[];
  estimatedCost: number;
  creditsUsed: number;
  error?: string;
}

export type StagingStatus =
  | 'uploading'
  | 'staging'
  | 'validating'
  | 'completed'
  | 'failed';

export interface ChatTurn {
  role: 'user' | 'model';
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

// ---------- Usage Record ----------

export interface UsageRecord extends BaseEntity {
  id: string;
  userId: string;
  service: 'gemini' | 'replicate' | 's3';
  action: CreditAction;
  model?: string;
  cost: number;
  creditsCharged: number;
  jobId?: string;
}

// ---------- Flag Reviews ----------

export interface FlagReview extends BaseEntity {
  id: string;
  userId: string;
  userEmail: string;
  sessionId: string;
  originalS3Key: string;
  stagedS3Key: string;
  style: string;
  roomTypes: string[];
  userNote?: string;
  status: 'pending' | 'accepted' | 'declined';
  adminNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  creditRefunded: boolean;
}

// Key patterns:
// FlagReview:  pk=REVIEW#{id}              sk=META
//              gsi1pk=REVIEWS#{status}     gsi1sk={createdAt}
//              (second row for user-lookup)
//              pk=USER#{userId}            sk=REVIEW#{createdAt}#{id}

// ---------- DynamoDB Key Patterns ----------
// User:        pk=USER#{id}          sk=PROFILE
//              gsi1pk=EMAIL          gsi1sk={email}
// StagingJob:  pk=USER#{userId}      sk=JOB#{id}
//              gsi1pk=USER#{userId}  gsi1sk=JOB#STATUS#{status}#{timestamp}
// Usage:       pk=USER#{userId}      sk=USAGE#{YYYY-MM}#{id}
//              gsi1pk=USER#{userId}  gsi1sk=USAGE#DATE#{YYYY-MM-DD}#{id}
// Session:     pk=SESSION#{id}       sk=META

// ────────────────────────────────────────────────────────────────────────
// Three Takes Bundle types
// ────────────────────────────────────────────────────────────────────────

/** Bundle choice: 'single' = 1 take, 1 credit; 'triple' = 3 takes, 2 credits. */
export type Bundle = 'single' | 'triple';

/**
 * Variant slot within a triple bundle. Maps fixedly to internal engines:
 *   slot 1 → NB Pro
 *   slot 2 → GPT Image 2 Full Medium
 *   slot 3 → GPT Image 2 Full High
 * For single bundles, slot is always 1 (NB Pro).
 *
 * Slot is internal. User-facing chip labels are landing-order based ("Take 1/2/3"),
 * NOT slot-based. Cover defaults pin to slot 3 (or highest succeeded slot).
 */
export type VariantSlot = 1 | 2 | 3;

export interface VariantConfig {
  slot: VariantSlot;
  provider: 'gemini' | 'openai';
  model: 'nano-banana-pro' | 'gpt-image-2';
  quality: 'standard' | 'medium' | 'high';
}

export const TRIPLE_VARIANTS = [
  { slot: 1, provider: 'gemini', model: 'nano-banana-pro', quality: 'standard' },
  { slot: 2, provider: 'openai', model: 'gpt-image-2', quality: 'medium' },
  { slot: 3, provider: 'openai', model: 'gpt-image-2', quality: 'high' },
] as const;

// Single-bundle slot 1 is GPT Image 2 Full Medium (not NB Pro). Per Tara's
// /admin/compare runs Medium is more consistently accurate than NB Pro on
// most rooms, ~$0.15 cheaper per credit, and only ~15-20s slower wall-clock.
// Triple-bundle slot 1 remains NB Pro — the variety in triple mode comes
// from NB-Pro + GPT-Med + GPT-High running in parallel.
export const SINGLE_VARIANTS = [
  { slot: 1, provider: 'openai', model: 'gpt-image-2', quality: 'medium' },
] as const;

export function variantsForBundle(bundle: Bundle): readonly VariantConfig[] {
  return bundle === 'triple' ? TRIPLE_VARIANTS : SINGLE_VARIANTS;
}

export function creditsPerStyle(bundle: Bundle): number {
  return bundle === 'triple' ? 2 : 1;
}

export function maxStylesForBundle(bundle: Bundle): number {
  return bundle === 'triple' ? 3 : 10;
}
