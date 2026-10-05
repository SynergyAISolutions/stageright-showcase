import { describe, it, expect } from 'vitest';
import { mergeSlots, isRoomFullyCovered, mergeAllSlots, isRoomVisible } from '@/lib/landing/slot-map';

const ALL_STYLES = [
  'Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse',
  'Mid-Century Modern','Industrial','Minimalist','Contemporary Australian',
  'Japandi','Boho',
];

describe('mergeSlots', () => {
  it('returns null when no pick is provided', () => {
    expect(mergeSlots(undefined)).toBeNull();
  });

  it('returns null when pick is disabled', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: false,
      picks: { Modern: 'tenants/a/m.jpg' },
      updatedAt: '2026-05-02T00:00:00Z',
    };
    expect(mergeSlots(pick)).toBeNull();
  });

  it('returns null when no resolvable URLs are present', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      updatedAt: '2026-05-02T00:00:00Z',
    };
    expect(mergeSlots(pick, {})).toBeNull();
  });

  it('returns slot with src + heroSrc when both keys resolve', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      heroByStyle: { Modern: 'tenants/a/h.jpg' },
      updatedAt: '2026-05-02T00:00:00Z',
    };
    const resolved = {
      'tenants/a/m.jpg': 'https://cdn/m.jpg',
      'tenants/a/h.jpg': 'https://cdn/h.jpg',
    };
    const out = mergeSlots(pick, resolved);
    expect(out?.styles.Modern.src).toBe('https://cdn/m.jpg');
    expect(out?.styles.Modern.heroSrc).toBe('https://cdn/h.jpg');
  });

  it('returns slot with src only when hero key is missing', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      updatedAt: '2026-05-02T00:00:00Z',
    };
    const resolved = { 'tenants/a/m.jpg': 'https://cdn/m.jpg' };
    const out = mergeSlots(pick, resolved);
    expect(out?.styles.Modern.src).toBe('https://cdn/m.jpg');
    expect(out?.styles.Modern.heroSrc).toBeUndefined();
  });
});

describe('isRoomFullyCovered', () => {
  it('returns false when no pick', () => {
    expect(isRoomFullyCovered(undefined)).toBe(false);
  });

  it('returns false when pick is disabled even with full coverage', () => {
    const picks = Object.fromEntries(ALL_STYLES.map((s) => [s, `tenants/a/${s}.jpg`]));
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: false,
      picks,
      updatedAt: '2026-05-02T00:00:00Z',
    };
    expect(isRoomFullyCovered(pick)).toBe(false);
  });

  it('returns true when enabled with all 12 styles picked', () => {
    const picks = Object.fromEntries(ALL_STYLES.map((s) => [s, `tenants/a/${s}.jpg`]));
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: true,
      picks,
      updatedAt: '2026-05-02T00:00:00Z',
    };
    expect(isRoomFullyCovered(pick)).toBe(true);
  });

  it('returns false when enabled but partial coverage', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      updatedAt: '2026-05-02T00:00:00Z',
    };
    expect(isRoomFullyCovered(pick)).toBe(false);
  });
});

describe('mergeAllSlots', () => {
  it('returns empty object when picks input is empty', () => {
    expect(mergeAllSlots({})).toEqual({});
  });

  it('produces one LandingSlot per fully-covered enabled set', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const fullPicks = Object.fromEntries(allStyles.map((s) => [s, `staged-${s}.jpg`]));
    const fullHeroes = Object.fromEntries(allStyles.map((s) => [s, `hero-${s}.jpg`]));

    const picks = {
      bedroom: [
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: true,
          picks: fullPicks, heroByStyle: fullHeroes, updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#1' as const, enabled: true,
          picks: fullPicks, heroByStyle: fullHeroes, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    };
    const resolved: Record<string, string> = {};
    for (const s of allStyles) {
      resolved[`staged-${s}.jpg`] = `https://cdn/staged-${s}.jpg`;
      resolved[`hero-${s}.jpg`] = `https://cdn/hero-${s}.jpg`;
    }

    const out = mergeAllSlots(picks, resolved);
    expect(out.bedroom).toHaveLength(2);
    expect(out.bedroom?.[0].styles.Modern.src).toBe('https://cdn/staged-Modern.jpg');
  });

  it('drops disabled or partial sets but keeps the room if any set is visible', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const fullPicks = Object.fromEntries(allStyles.map((s) => [s, `s-${s}.jpg`]));
    const partialPicks = { Modern: 's-Modern.jpg' };
    const resolved: Record<string, string> = {};
    for (const s of allStyles) resolved[`s-${s}.jpg`] = `https://cdn/s-${s}.jpg`;

    const picks = {
      bedroom: [
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: false,
          picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#1' as const, enabled: true,
          picks: partialPicks, updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#2' as const, enabled: true,
          picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    };
    const out = mergeAllSlots(picks, resolved);
    expect(out.bedroom).toHaveLength(1); // only set #2 survives
  });

  it('drops the room entirely when no set is visible', () => {
    const partial = { Modern: 's.jpg' };
    const picks = {
      bedroom: [
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: false,
          picks: partial, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    };
    const out = mergeAllSlots(picks, { 's.jpg': 'https://cdn/s.jpg' });
    expect(out.bedroom).toBeUndefined();
  });
});

describe('isRoomVisible', () => {
  it('returns false for empty array', () => {
    expect(isRoomVisible([])).toBe(false);
  });

  it('returns true when any set in the array is fully covered + enabled', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const fullPicks = Object.fromEntries(allStyles.map((s) => [s, `${s}.jpg`]));
    const sets = [
      { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: false,
        picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
      { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#1' as const, enabled: true,
        picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
    ];
    expect(isRoomVisible(sets)).toBe(true);
  });

  it('returns false when every set is partial or disabled', () => {
    const sets = [
      { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: true,
        picks: { Modern: 'm.jpg' }, updatedAt: '2026-05-02T00:00:00Z' },
    ];
    expect(isRoomVisible(sets)).toBe(false);
  });
});
