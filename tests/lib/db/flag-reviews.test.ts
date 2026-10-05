import { describe, it, expect } from 'vitest';
import { checkEligibility } from '@/lib/db/flag-reviews';

const base = {
  sessionId: 'sess-1',
  userId: 'u1',
  session: {
    sessionId: 'sess-1',
    referenceS3Keys: [] as string[],
    createdAt: new Date().toISOString(),
  },
  userPendingCount: 0,
  duplicateExists: false,
  secondsSinceResult: 120,
};

describe('checkEligibility', () => {
  it('allows a fresh no-reference session with no pending', () => {
    expect(checkEligibility(base).eligible).toBe(true);
  });

  it('blocks when references were used', () => {
    const r = checkEligibility({ ...base, session: { ...base.session, referenceS3Keys: ['k'] } });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('references-used');
  });

  it('blocks when user already has a pending review', () => {
    const r = checkEligibility({ ...base, userPendingCount: 1 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('pending-exists');
  });

  it('blocks when staging is older than 30 days', () => {
    const d = new Date(); d.setDate(d.getDate() - 31);
    const r = checkEligibility({ ...base, session: { ...base.session, createdAt: d.toISOString() } });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('too-old');
  });

  it('blocks duplicates for same session', () => {
    const r = checkEligibility({ ...base, duplicateExists: true });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('already-flagged');
  });

  it('blocks within 60s cool-down', () => {
    const r = checkEligibility({ ...base, secondsSinceResult: 30 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('cool-down');
  });
});
