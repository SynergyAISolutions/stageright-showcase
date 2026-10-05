import { describe, it, expect } from 'vitest';
import { buildBatchWaitNotes, STYLE_CONCIERGE_BASE } from '@/lib/ai/prompts';

describe('buildBatchWaitNotes', () => {
  it('returns 5 tagged entries for a single style with roomLabel interpolated', () => {
    const result = buildBatchWaitNotes({ styles: ['Coastal'], roomTypes: ['Living Room'] });
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      note: 'Pulling light blues and sandy beiges into your living room.',
      style: 'Coastal',
    });
    expect(result[1]).toEqual({
      note: 'Weaving in rattan and linen textures.',
      style: 'Coastal',
    });
    expect(result[4]).toEqual({
      note: 'Keeping the layout airy and the palette breathable.',
      style: 'Coastal',
    });
  });

  it('interleaves tagged notes across two styles so both get airtime in the first pass', () => {
    const result = buildBatchWaitNotes({
      styles: ['Coastal', 'Modern'],
      roomTypes: ['Bedroom'],
    });
    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({
      note: 'Pulling light blues and sandy beiges into your bedroom.',
      style: 'Coastal',
    });
    expect(result[1]).toEqual({
      note: 'Layering clean lines and neutral tones through your bedroom.',
      style: 'Modern',
    });
    expect(result[2]).toEqual({
      note: 'Weaving in rattan and linen textures.',
      style: 'Coastal',
    });
    expect(result[3]).toEqual({
      note: 'Adding geometric shapes and polished surfaces.',
      style: 'Modern',
    });
  });

  it('interleaves three styles so the first three notes each tag a different style', () => {
    const result = buildBatchWaitNotes({
      styles: ['Coastal', 'Modern', 'Japandi'],
      roomTypes: ['Studio'],
    });
    expect(result).toHaveLength(15);
    expect(result[0].style).toBe('Coastal');
    expect(result[1].style).toBe('Modern');
    expect(result[2].style).toBe('Japandi');
    expect(result[0].note).toContain('Pulling light blues');
    expect(result[1].note).toContain('Layering clean lines');
    expect(result[2].note).toContain('Choosing low-profile natural wood');
  });

  it('falls back to "room" when roomTypes is empty', () => {
    const result = buildBatchWaitNotes({ styles: ['Modern'], roomTypes: [] });
    expect(result[0].note).toContain('your room');
    expect(result[0].style).toBe('Modern');
  });

  it('uses the first room type when multiple are provided', () => {
    const result = buildBatchWaitNotes({
      styles: ['Boho'],
      roomTypes: ['Living Room', 'Dining Room'],
    });
    expect(result[0].note).toContain('living room');
    expect(result[0].note).not.toContain('dining');
    expect(result[0].style).toBe('Boho');
  });

  it('returns [] when styles array is empty', () => {
    const result = buildBatchWaitNotes({ styles: [], roomTypes: ['Bedroom'] });
    expect(result).toEqual([]);
  });

  it('never mutates STYLE_CONCIERGE_BASE', () => {
    const before = STYLE_CONCIERGE_BASE.Coastal[0];
    buildBatchWaitNotes({ styles: ['Coastal'], roomTypes: ['Kitchen'] });
    expect(STYLE_CONCIERGE_BASE.Coastal[0]).toBe(before);
    expect(STYLE_CONCIERGE_BASE.Coastal[0]).toContain('{roomLabel}');
  });
});
