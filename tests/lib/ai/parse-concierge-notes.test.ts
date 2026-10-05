import { describe, it, expect } from 'vitest';
import {
  parseConciergeNotes,
  stripConciergeNotes,
} from '@/lib/ai/parse-concierge-notes';

describe('parseConciergeNotes', () => {
  it('extracts bulleted notes after the CONCIERGE NOTES: heading', () => {
    const input = `Some analysis text above.

5. Furniture WITHIN constraints: place the sofa...

CONCIERGE NOTES:
- Light's coming from the bay window on the left.
- Keeping the air-con sightline clear.
- You asked for cosy — leaning into warm timber tones.
`;
    expect(parseConciergeNotes(input)).toEqual([
      "Light's coming from the bay window on the left.",
      'Keeping the air-con sightline clear.',
      'You asked for cosy — leaning into warm timber tones.',
    ]);
  });

  it('returns [] when the heading is missing', () => {
    expect(parseConciergeNotes('no heading here')).toEqual([]);
  });

  it('clamps to at most 4 notes', () => {
    const input = `CONCIERGE NOTES:
- One.
- Two.
- Three.
- Four.
- Five.
`;
    expect(parseConciergeNotes(input)).toHaveLength(4);
  });

  it('ignores lines longer than 200 characters (runaway bullets)', () => {
    const long = 'x'.repeat(210);
    const input = `CONCIERGE NOTES:
- Short one.
- ${long}
- Another short one.
`;
    expect(parseConciergeNotes(input)).toEqual(['Short one.', 'Another short one.']);
  });

  it('is case-insensitive on the heading', () => {
    const input = `concierge notes:
- Lowercase heading.
`;
    expect(parseConciergeNotes(input)).toEqual(['Lowercase heading.']);
  });

  it('tolerates leading whitespace before bullets', () => {
    const input = `CONCIERGE NOTES:
  - Indented bullet.
- Not indented.
`;
    expect(parseConciergeNotes(input)).toEqual(['Indented bullet.', 'Not indented.']);
  });

  it('trims trailing whitespace on each note', () => {
    const input = `CONCIERGE NOTES:
- Ends with spaces.
- Ends with tab.\t
`;
    expect(parseConciergeNotes(input)).toEqual(['Ends with spaces.', 'Ends with tab.']);
  });
});

describe('stripConciergeNotes', () => {
  it('removes the CONCIERGE NOTES section and its bullets', () => {
    const input = `Analysis body.

5. Furniture: sofa facing fireplace.

CONCIERGE NOTES:
- Light from bay window.
- Air-con on north wall.`;
    const result = stripConciergeNotes(input);
    expect(result).not.toContain('CONCIERGE NOTES:');
    expect(result).not.toContain('Light from bay window');
    expect(result).not.toContain('Air-con on north wall');
    expect(result).toContain('5. Furniture: sofa facing fireplace.');
  });

  it('is a no-op when no CONCIERGE NOTES section is present', () => {
    const input = 'Plain analysis, no notes.';
    expect(stripConciergeNotes(input)).toBe('Plain analysis, no notes.');
  });

  it('is case-insensitive on the heading', () => {
    const input = `Body.

concierge notes:
- one.`;
    expect(stripConciergeNotes(input)).toBe('Body.');
  });

  it('trims trailing whitespace after stripping', () => {
    const input = `Body content.


CONCIERGE NOTES:
- bullet.`;
    const result = stripConciergeNotes(input);
    expect(result).toBe('Body content.');
  });
});
