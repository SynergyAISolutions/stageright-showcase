import type { MetadataRoute } from 'next';

const SITE_URL = 'https://stageright.aiwave.com.au';

// Only public, indexable pages go here. App routes (/stage, /dashboard,
// /admin, /api/*) are user-auth walled and should not be in the sitemap;
// robots.txt also disallows them.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
