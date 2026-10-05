'use client';

import { type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface TileProps {
  coverUrl: string | null;
  name: string;
  sub: string;
  href?: string;
  onClick?: () => void;
  /** For staggered enter animation. */
  index?: number;
  alt?: string;
  /** Optional "before" image (the original room photo behind the cover).
   *  When present, it crossfades in over the cover on hover. */
  hoverUrl?: string | null;
  /** Optional overflow/action control rendered as an overlay in the
   *  cover's top-right. Rendered OUTSIDE the Link/button so it doesn't
   *  nest interactive elements (button-in-anchor is invalid HTML and
   *  swallows the action's clicks). */
  menu?: ReactNode;
}

/**
 * Uniform tile used by dashboard (listings) and listing detail (rooms).
 * 4:3 cover (object-cover, normalises any source aspect) + name (heading,
 * truncated) + sub (one line). Identical dimensions across all tiles in a
 * grid because covers share aspect-ratio and meta padding.
 */
export function Tile({ coverUrl, name, sub, href, onClick, index = 0, alt, menu, hoverUrl }: TileProps) {
  const inner = (
    <div className="group bg-white rounded-xl overflow-hidden border border-sr-ink/[0.06] flex flex-col h-full shadow-[0_1px_2px_rgba(31,53,57,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(31,53,57,0.18)] hover:border-sr-ink/[0.10]">
      <div className="aspect-[4/3] w-full bg-sr-cream relative overflow-hidden">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={alt || name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sr-ink-mute text-sm">
            No image yet
          </div>
        )}
        {/* Before/after hover: the original room photo fades in over the staged
            cover. Sits above the cover (later in DOM) and unscaled, so the
            cover's hover-zoom never peeks at the edges. */}
        {coverUrl && hoverUrl && (
          <>
            <Image
              src={hoverUrl}
              alt={`${alt || name} — original`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
            <span className="absolute bottom-2 left-2 z-[1] rounded-full bg-sr-ink/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              Original
            </span>
          </>
        )}
      </div>
      <div className="px-2.5 py-2 sm:px-3 sm:py-2.5">
        <h3 className="text-[11px] sm:text-xs font-medium text-sr-ink leading-snug break-words">{name}</h3>
        <p className="text-[9px] sm:text-[10px] text-sr-ink-mute mt-0.5">{sub}</p>
      </div>
    </div>
  );

  const wrapped = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="h-full"
    >
      {inner}
    </motion.div>
  );

  const node = href ? (
    <Link href={href} className="block h-full">{wrapped}</Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className="block w-full h-full text-left">{wrapped}</button>
  ) : (
    wrapped
  );

  if (menu) {
    return (
      <div className="relative h-full">
        {node}
        <div className="absolute top-2 right-2 z-10">{menu}</div>
      </div>
    );
  }
  return node;
}

interface NewTileProps {
  label: string;
  onClick: () => void;
  index?: number;
}

/**
 * Terra-accent "create new" tile. Fills its grid cell — row height is set by
 * sibling Tiles in the same row, so this stays uniform without needing the
 * aspect-ratio + invisible-meta trick. Centered + and label inside a stronger
 * terra surface that reads as the primary "new" affordance.
 */
export function NewTile({ label, onClick, index = 0 }: NewTileProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="group relative bg-sr-terra/[0.10] border-[1.5px] border-sr-terra/35 rounded-xl flex flex-col items-center justify-center w-full h-full min-h-[140px] text-center text-sr-terra shadow-[0_1px_2px_rgba(199,111,78,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-sr-terra/[0.16] hover:border-sr-terra/55 hover:shadow-[0_10px_28px_-12px_rgba(199,111,78,0.45)] active:scale-[0.99]"
    >
      <span
        className="text-[30px] sm:text-[36px] leading-none mb-2 transition-transform duration-300 group-hover:scale-110"
        aria-hidden
      >
        +
      </span>
      <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.10em] uppercase">
        {label}
      </span>
    </motion.button>
  );
}
