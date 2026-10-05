import { describe, it, expect } from 'vitest';
import {
  STYLE_CONCIERGE_BASE,
  buildConciergeNotes,
  STAGING_STYLES,
} from '@/lib/ai/prompts';

describe('STYLE_CONCIERGE_BASE', () => {
  it('has exactly 5 notes for every staging style', () => {
    for (const style of STAGING_STYLES) {
      const notes = STYLE_CONCIERGE_BASE[style];
      expect(notes, `style ${style}`).toHaveLength(5);
      for (const note of notes) {
        expect(note.length).toBeGreaterThan(0);
        expect(note.length).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('buildConciergeNotes', () => {
  it('interpolates {roomLabel} with the lowercase first room type', () => {
    const result = buildConciergeNotes({
      style: 'Coastal',
      roomTypes: ['Living Room'],
      analyserNotes: [],
    });
    expect(result[0]).toBe('Pulling light blues and sandy beiges into your living room.');
    expect(result).toHaveLength(5);
  });

  it('falls back to "room" when roomTypes is empty', () => {
    const result = buildConciergeNotes({
      style: 'Modern',
      roomTypes: [],
      analyserNotes: [],
    });
    expect(result[0]).toBe('Layering clean lines and neutral tones through your room.');
  });

  // Analyser notes lead so the wait screen narrates in pipeline order: read the
  // room first, then pull the style into it.
  it('puts analyser notes before the 5 base notes', () => {
    const result = buildConciergeNotes({
      style: 'Japandi',
      roomTypes: ['Bedroom'],
      analyserNotes: [
        'Noted the skylight — warm side for the bed.',
        'Keeping the wardrobe clear.',
      ],
    });
    expect(result).toHaveLength(7);
    expect(result[0]).toBe('Noted the skylight — warm side for the bed.');
    expect(result[1]).toBe('Keeping the wardrobe clear.');
    expect(result.slice(2)).toEqual(
      buildConciergeNotes({ style: 'Japandi', roomTypes: ['Bedroom'], analyserNotes: [] }),
    );
  });

  it('uses the first room type when multiple are provided', () => {
    const result = buildConciergeNotes({
      style: 'Boho',
      roomTypes: ['Living Room', 'Dining Room'],
      analyserNotes: [],
    });
    expect(result[0]).toContain('living room');
    expect(result[0]).not.toContain('dining');
  });

  it('never mutates STYLE_CONCIERGE_BASE', () => {
    const before = STYLE_CONCIERGE_BASE.Coastal[0];
    buildConciergeNotes({ style: 'Coastal', roomTypes: ['Kitchen'], analyserNotes: [] });
    const after = STYLE_CONCIERGE_BASE.Coastal[0];
    expect(after).toBe(before);
    expect(after).toContain('{roomLabel}');
  });
});
