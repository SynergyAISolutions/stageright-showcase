'use client';

import { useState } from 'react';
import Image from 'next/image';

interface LandingThumbnailProps {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
  /** Hint to Next.js Image for sizing optimization. Use the largest expected
   *  rendered width (in viewport units or px). Defaults to a sensible 800px
   *  for medium thumbs; the slider preview overrides with larger sizes. */
  sizes?: string;
}

/**
 * Next.js Image-backed thumbnail with onError fallback to a local JPG.
 * Used for landing thumbnails so a deleted picked staging never leaves a
 * broken icon on the public site, AND so each load goes through Next's
 * on-demand resize/WebP optimization (the original S3 staged images are
 * full-resolution photos at 2-4 MB each — Next serves a viewport-sized
 * variant typically under 200 KB).
 */
export function LandingThumbnail({ src, fallback, alt, className, sizes = '(max-width: 768px) 100vw, 800px' }: LandingThumbnailProps) {
  const [current, setCurrent] = useState(src);
  const [erroredOnce, setErroredOnce] = useState(false);
  return (
    <Image
      src={current}
      alt={alt}
      className={className}
      fill
      sizes={sizes}
      onError={() => {
        if (!erroredOnce && current !== fallback) {
          setErroredOnce(true);
          setCurrent(fallback);
        }
      }}
    />
  );
}
