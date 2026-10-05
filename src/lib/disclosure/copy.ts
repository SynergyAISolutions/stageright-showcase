export interface ListingCopyVariant {
  id: 'standard' | 'short' | 'eu';
  label: string;
  description: string;
  text: string;
}

export const LISTING_COPY_VARIANTS: ListingCopyVariant[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Recommended for most listings.',
    text: 'Image virtually staged with AI. Furniture is illustrative; the property is sold unfurnished.',
  },
  {
    id: 'short',
    label: 'Short',
    description: 'When listing space is tight.',
    text: 'Image virtually staged with AI.',
  },
  {
    id: 'eu',
    label: 'EU-friendly',
    description: 'Extra explicit per EU AI Act Art. 50.',
    text: 'AI-generated image. Property sold unfurnished.',
  },
];

// Bump this when the copy changes — the hub footer surfaces it for confidence.
export const COPY_LAST_UPDATED = '2026-04-26';
