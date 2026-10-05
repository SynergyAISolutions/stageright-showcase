export interface PlatformNote {
  name: string;
  note: string;
}

export interface RegionNote {
  name: string;
  note: string;
}

export const PLATFORM_NOTES: PlatformNote[] = [
  { name: 'realestate.com.au', note: 'Requires virtually-staged images to be labelled. The on-image label and a one-line listing note both meet their rules.' },
  { name: 'Domain', note: 'Requires disclosure of digitally-altered imagery in the listing description. Pair with the on-image label for full coverage.' },
  { name: 'Zillow', note: 'Photo guidelines require "Virtually Staged" or equivalent labelling on the image itself. Listings flagged without a label are removed.' },
  { name: 'Rightmove', note: '2023 listing guidelines require a "Virtually Staged" or "CGI" label on the image. The StageRight watermark satisfies this.' },
  { name: 'Zoopla', note: 'Aligned with Rightmove — on-image label required, listing description disclosure recommended.' },
];

export const REGION_NOTES: RegionNote[] = [
  {
    name: 'Australia',
    note: 'ACL s18 (misleading or deceptive conduct) covers undisclosed virtual staging — civil penalties up to A$50M for corporations. Victoria has the most explicit "label digitally altered images" guidance via Consumer Affairs Victoria. NSW, QLD, WA, SA, TAS, ACT, NT have no virtual-staging-specific rules; ACL applies. Add the listing-description note in addition to the on-image label.',
  },
  {
    name: 'United Kingdom',
    note: 'CPRs 2008 (Reg 5 misleading actions, Reg 6 misleading omissions) cover undisclosed virtual staging. Trading Standards enforces. The Digital Markets, Competition and Consumers Act 2024 raised CMA fining authority to 10% of global turnover.',
  },
  {
    name: 'United States',
    note: 'NAR Code of Ethics Article 12 + Standard of Practice 12-10 require truthful representation. Most state real-estate commissions enforce via general misleading-advertising rules; no state has a virtual-staging-specific statute. Most major MLS require both image-level and listing-text disclosure — non-compliance = listing removal + member fines.',
  },
  {
    name: 'European Union',
    note: 'EU AI Act Article 50 — both providers (machine-readable marking) and deployers (human-readable disclosure). Provider obligation is satisfied by Google/OpenAI signed metadata on the model output. Deployer obligation falls on the agent — use the EU-friendly listing copy variant when publishing to EU consumers. Effective 2 August 2026.',
  },
];

export const ON_IMAGE_EXPLAINER = `Every StageRight image carries a "Virtually Staged · AI" pill in the bottom-right corner. The label is burned into the image — it travels with the file when downloaded, shared, or screenshot-cropped (within reason), so your listing stays above board on REA, Domain, Zillow, Rightmove, and any major platform.`;

export const WHY_LISTING_DESCRIPTION_MATTERS = `The on-image label covers the image. Your listing description covers the listing. Most platforms expect both — the description note is a one-line addition to your existing copy and pre-empts buyer questions.`;
