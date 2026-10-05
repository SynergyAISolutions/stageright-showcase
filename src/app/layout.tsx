import type { Metadata } from 'next';
import { DM_Serif_Display, Outfit, Fraunces, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const serif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-heading',
  display: 'swap',
});

const sans = Outfit({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

// Landing redesign typography. Fraunces is the display + italic-accent face
// (variable axes including italic + opsz + SOFT). JetBrains Mono drives spec
// labels and microcopy. Loaded here so any page can opt in via the
// font-display / font-mono Tailwind families, but the landing-shell wrapper
// is the primary consumer.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'opsz'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE_URL = 'https://stageright.aiwave.com.au';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'AI Virtual Staging for Real Estate Listings | StageRight',
  description:
    'AI virtual staging for real estate agents. Stage empty or furnished listings in just minutes. Photorealistic output, 12 styles, a free credit every 7 you spend. 30 free credits to start, no credit card.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'StageRight',
    title: 'AI Virtual Staging for Real Estate Listings | StageRight',
    description:
      'Stage empty or furnished listings in just minutes. Photorealistic AI virtual staging for real estate agents. 30 free credits, no credit card.',
    images: [
      {
        url: '/style-thumbnails/living-room/scandinavian.jpg',
        width: 1200,
        height: 900,
        alt: 'Photorealistic virtual staging output from StageRight',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Virtual Staging for Real Estate Listings | StageRight',
    description:
      'AI virtual staging for real estate agents. Stage listings in just minutes. 30 free credits, no credit card.',
    images: ['/style-thumbnails/living-room/scandinavian.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/icons/android/icon-light-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/android/icon-light-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/android/icon-light-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
};

// Schema.org structured data. SoftwareApplication + Organization + FAQPage
// give Google what it needs for rich results (sitelink boxes, Knowledge
// Panel, FAQ rich snippets). Inlined here so every page inherits the site
// context; page-level components can add page-specific schema on top.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'StageRight',
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'AI virtual staging for real estate agents. Upload a listing photo, pick a style, receive a photorealistic staged image in just minutes.',
      offers: [
        {
          '@type': 'Offer',
          name: 'Starter',
          price: '24',
          priceCurrency: 'AUD',
          description: '20 credits — 10 staged rooms in Three Takes default',
        },
        {
          '@type': 'Offer',
          name: 'Plus',
          price: '49',
          priceCurrency: 'AUD',
          description: '50 credits — 25 staged rooms in Three Takes default',
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '99',
          priceCurrency: 'AUD',
          description: '125 credits — 62 staged rooms in Three Takes default',
        },
        {
          '@type': 'Offer',
          name: 'Bulk',
          price: '219',
          priceCurrency: 'AUD',
          description: '300 credits — 150 staged rooms in Three Takes default',
        },
      ],
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: 'StageRight',
      url: SITE_URL,
      logo: `${SITE_URL}/icons/android/logo-mark-light.png`,
      description:
        'AI virtual staging for Australian real estate agents. Built in Australia.',
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is virtual staging MLS-compliant?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Yes. StageRight output is virtual staging, not a representation of actual furniture on site. Agents should disclose in listing descriptions and label photos as 'virtually staged'. That's standard practice across Australian REIA, US NAR and Canadian REBBA guidelines.",
          },
        },
        {
          '@type': 'Question',
          name: 'How does AI virtual staging compare to traditional staging?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Physical staging typically runs $3,500–$6,000 for a three-bedroom house, takes weeks and requires a vacant property with furniture rental and movers. Human-edit virtual staging is about $23–$35 per photo with a 24–48 hour turnaround. StageRight is from $0.73 AUD per credit (one staged image, at the 300-credit Bulk rate), in just minutes, works on any photo.',
          },
        },
        {
          '@type': 'Question',
          name: 'What image formats and resolutions does StageRight accept?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'JPG or PNG up to 10 MB, any resolution. Phone photos work fine. Furnished or empty rooms both supported.',
          },
        },
        {
          '@type': 'Question',
          name: 'What styles can I stage in?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Twelve curated styles: Modern, Scandinavian, Coastal, Hamptons, Luxury, Farmhouse, Mid-Century Modern, Industrial, Minimalist, Contemporary Australian, Japandi and Boho. Contemporary Australian is specifically tuned to the AU market aesthetic.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do credits expire?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. Credits never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses.',
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${fraunces.variable} ${mono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          // JSON-LD schema must render as raw JSON, not escaped. This is the
          // Next.js-supported pattern for structured data.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-body bg-surface text-ink antialiased">
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
