/**
 * Staging style prompt templates.
 */

export const STAGING_STYLES = [
  'Modern',
  'Scandinavian',
  'Coastal',
  'Hamptons',
  'Luxury',
  'Farmhouse',
  'Mid-Century Modern',
  'Industrial',
  'Minimalist',
  'Contemporary Australian',
  'Japandi',
  'Boho',
] as const;

export type StagingStyle = (typeof STAGING_STYLES)[number];

/**
 * Short human-readable tagline per style — used in the list picker
 * so users can recognise a style without seeing the name alone.
 */
export const STYLE_TAGLINES: Record<StagingStyle, string> = {
  Modern: 'Clean lines, neutral tones, bold accents',
  Scandinavian: 'Light wood, soft whites, cozy textiles',
  Coastal: 'Light blues, sandy beiges, beach-house feel',
  Hamptons: 'White and navy, natural timber, elegant',
  Luxury: 'Marble, velvet, brass — high-end designer',
  Farmhouse: 'Rustic timber, warm whites, vintage pieces',
  'Mid-Century Modern': 'Organic curves, warm woods, retro colours',
  Industrial: 'Exposed metal, raw timber, urban warehouse',
  Minimalist: 'Few pieces, monochrome, negative space',
  'Contemporary Australian': 'Native timber, stone, indoor-outdoor',
  Japandi: 'Japanese + Scandi — warm minimalism',
  Boho: 'Rattan, layered textiles, earthy terracotta',
};

/**
 * Three-colour accent palette per style, rendered as dots beside each
 * row in the style picker. Reused by the wizard and the landing showcase.
 */
export const STYLE_PALETTES: Record<StagingStyle, string[]> = {
  Modern: ['#1a1a1a', '#f5f5f4', '#8a8887'],
  Scandinavian: ['#e8e1d4', '#d9cfc0', '#8c7b66'],
  Coastal: ['#cfe1ec', '#e8dfd0', '#9cb8c9'],
  Hamptons: ['#1e2a44', '#ffffff', '#a68a5a'],
  Luxury: ['#111111', '#d4a95a', '#6a5a3c'],
  Farmhouse: ['#f5efe3', '#c3a97f', '#6e5840'],
  'Mid-Century Modern': ['#a55a2a', '#e7c98f', '#2c3e2d'],
  Industrial: ['#2a2a28', '#6a6a68', '#a0745a'],
  Minimalist: ['#ffffff', '#e8e8e6', '#2a2a28'],
  'Contemporary Australian': ['#d9c6a6', '#6e8a5e', '#2a2a28'],
  Japandi: ['#c8b89a', '#756651', '#2a2a2a'],
  Boho: ['#c97c4a', '#d9ba8a', '#6a5238'],
};

/**
 * Translate a style name into the kebab-cased filename used for its
 * thumbnail assets under /public/style-thumbnails/.
 */
export function styleToFilename(style: StagingStyle): string {
  return style.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Style-specific prompt additions layered on top of the base staging prompt.
 */
export const STYLE_DETAILS: Record<StagingStyle, string> = {
  Modern:
    'Use clean lines, neutral tones with bold accent pieces, geometric shapes, and polished surfaces.',
  Scandinavian:
    'Use light wood tones, soft whites and greys, cozy textiles, and organic shapes. Hygge atmosphere.',
  Coastal:
    'Use light blues, sandy beiges, natural textures like rattan and linen. Relaxed beach-house feel.',
  Hamptons:
    'Use classic white and navy palette, natural timber, elegant proportions. Relaxed luxury.',
  Luxury:
    'Use rich materials — marble, velvet, brass accents. Statement lighting. High-end designer aesthetic.',
  Farmhouse:
    'Use rustic timber, warm whites, natural fabrics, vintage-inspired pieces. Cozy and inviting.',
  'Mid-Century Modern':
    'Use organic curves, tapered legs, warm woods, bold retro colours. Iconic 1950s-60s pieces.',
  Industrial:
    'Use exposed metal, raw timber, leather, concrete tones. Urban warehouse aesthetic.',
  Minimalist:
    'Use very few carefully chosen pieces, monochrome palette, clean negative space. Less is more.',
  'Contemporary Australian':
    'Use native timber, natural stone, earthy tones, indoor-outdoor connection. Relaxed but refined.',
  Japandi:
    'Use a fusion of Japanese and Scandinavian — low-profile natural wood furniture, muted earthy palette, ceramic and linen textures, negative space, restraint. Warm minimalism.',
  Boho:
    'Use rattan, layered textiles, plants, warm earth tones with terracotta and ochre accents, macrame or woven wall art, eclectic pieces. Relaxed and free-spirited.',
};

/**
 * Concierge-voiced base notes per style. Five per style, rendered to the
 * user during the wait screen alongside 0-4 room-specific observations from
 * the analyser. Interpolation: `{roomLabel}` is replaced at render time with
 * `roomTypes[0]?.toLowerCase() ?? 'room'`.
 *
 * Derived from STYLE_DETAILS — these are the actual design directions the
 * staging model is told to execute, voiced as concierge narration.
 */
export const STYLE_CONCIERGE_BASE: Record<StagingStyle, [string, string, string, string, string]> = {
  Modern: [
    'Layering clean lines and neutral tones through your {roomLabel}.',
    'Adding geometric shapes and polished surfaces.',
    'Finishing with one or two bold accent pieces.',
    'Placing pieces with breathing room between them.',
    'Letting materials speak — concrete, glass, warm timber.',
  ],
  Scandinavian: [
    'Warming your {roomLabel} with light wood and soft whites.',
    'Layering cozy textiles for hygge.',
    'Keeping shapes organic, mood calm.',
    'Choosing pieces with gentle curves and low profiles.',
    'Completing the scene with soft wool and quiet ceramic.',
  ],
  Coastal: [
    'Pulling light blues and sandy beiges into your {roomLabel}.',
    'Weaving in rattan and linen textures.',
    'Aiming for that relaxed beach-house feel.',
    'Adding driftwood and woven accents where they land.',
    'Keeping the layout airy and the palette breathable.',
  ],
  Hamptons: [
    'Layering classic white and navy across your {roomLabel}.',
    'Adding natural timber and elegant proportions.',
    'Finishing with relaxed-luxury details.',
    'Balancing tailored upholstery with casual rattan or cane.',
    'Closing with crisp linen and brass-trimmed detail.',
  ],
  Luxury: [
    'Layering marble, velvet, and brass accents into your {roomLabel}.',
    'Placing statement lighting as the anchor.',
    'Finishing with high-end designer touches.',
    'Positioning each piece as its own considered moment.',
    'Layering in silk, mohair, and polished stone.',
  ],
  Farmhouse: [
    'Warming your {roomLabel} with rustic timber and natural fabrics.',
    'Adding warm whites and vintage-inspired pieces.',
    'Keeping it cozy and inviting.',
    'Adding a weathered element that carries some history.',
    'Layering soft linen and hand-thrown ceramic details.',
  ],
  'Mid-Century Modern': [
    'Choosing organic curves and tapered-leg pieces for your {roomLabel}.',
    'Layering warm woods with bold retro colours.',
    'Placing iconic 1950s–60s pieces as anchors.',
    'Balancing bold silhouettes with warm, lived-in wood.',
    'Finishing with a graphic rug or statement pendant.',
  ],
  Industrial: [
    'Balancing exposed metal and raw timber in your {roomLabel}.',
    'Adding leather and concrete tones.',
    'Aiming for that urban-warehouse feel.',
    'Anchoring the space with one substantial statement piece.',
    'Adding patinaed metal and tactile leather details.',
  ],
  Minimalist: [
    'Choosing very few carefully placed pieces for your {roomLabel}.',
    'Keeping the palette monochrome.',
    'Leaving clean negative space — less is more.',
    'Placing each piece where it earns its place.',
    'Allowing one quiet textural or material contrast.',
  ],
  'Contemporary Australian': [
    'Layering native timber and natural stone through your {roomLabel}.',
    'Pulling in earthy tones and indoor-outdoor touches.',
    'Keeping the mood relaxed but refined.',
    'Letting the view and natural light lead the composition.',
    'Finishing with handcrafted ceramic and woven details.',
  ],
  Japandi: [
    'Choosing low-profile natural wood furniture for your {roomLabel}.',
    'Layering ceramic, linen, and a muted earthy palette.',
    'Leaving negative space — warm minimalism.',
    'Choosing pieces that breathe — low, grounded, unhurried.',
    'Closing with a single ceramic or woven accent.',
  ],
  Boho: [
    'Layering rattan, textiles, and warm earth tones in your {roomLabel}.',
    'Adding terracotta and ochre accents.',
    'Finishing with plants and eclectic, free-spirited pieces.',
    'Layering patterns and textures without overcrowding.',
    'Finishing with soft greenery and a hand-dyed detail.',
  ],
};

/**
 * Combine style-derived base notes with analyser-derived room observations.
 * Always returns a non-empty array (at minimum the 5 base notes). Pure.
 *
 * The wizard calls this BEFORE the analyse request completes (with
 * analyserNotes=[]) to pre-fill the wait screen instantly, then calls it
 * AGAIN with the analyser's notes once they arrive — the note rotator
 * picks up the longer array seamlessly.
 */
export function buildConciergeNotes(args: {
  style: StagingStyle;
  roomTypes: string[];
  analyserNotes: string[];
}): string[] {
  const roomLabel = args.roomTypes[0]?.toLowerCase() ?? 'room';
  const base = STYLE_CONCIERGE_BASE[args.style].map((n) =>
    n.replace('{roomLabel}', roomLabel),
  );
  // Order: room-analysis notes FIRST (the model is reading the room),
  // style notes SECOND (the model is then pulling the style into the
  // analysed space). Matches the actual Lambda pipeline order so the
  // wait-concierge narrates what's happening, not a reversed story.
  return [...args.analyserNotes, ...base];
}

/**
 * Build wait-screen notes for a multi-style batch.
 *
 * Takes N selected styles, reads each one's 5 base notes from
 * STYLE_CONCIERGE_BASE, interpolates {roomLabel}, and interleaves them
 * round-robin so the first N notes shown touch each style once before
 * deepening into any single style.
 *
 * Each entry carries its own `style` so the wait screen can render a
 * per-note style label. Order is tagged so the parallel `.map(e => e.note)`
 * and `.map(e => e.style)` derivations are correctly aligned.
 *
 * Pure. No side effects.
 */
export function buildBatchWaitNotes(args: {
  styles: StagingStyle[];
  roomTypes: string[];
}): Array<{ note: string; style: StagingStyle }> {
  if (args.styles.length === 0) return [];
  const roomLabel = args.roomTypes[0]?.toLowerCase() ?? 'room';
  const perStyle = args.styles.map((s) => ({
    style: s,
    notes: STYLE_CONCIERGE_BASE[s].map((n) => n.replace('{roomLabel}', roomLabel)),
  }));
  const maxLen = Math.max(...perStyle.map((p) => p.notes.length));
  const result: Array<{ note: string; style: StagingStyle }> = [];
  for (let i = 0; i < maxLen; i++) {
    for (const { style, notes } of perStyle) {
      if (notes[i]) result.push({ note: notes[i], style });
    }
  }
  return result;
}
