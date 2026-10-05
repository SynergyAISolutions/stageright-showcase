import { cn } from '@/lib/utils/cn';

interface FoldFadeContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Bottom fade size in px. Default 24. */
  fadeSize?: number;
}

/**
 * Scrollable wrap with a bottom mask gradient. Used on the dashboard and
 * listing detail grids — when content overflows, the bottom 24px fades
 * cream-to-transparent so partial rows beyond the fold dissolve cleanly
 * instead of getting half-cropped.
 */
export function FoldFadeContainer({ children, className, fadeSize = 24 }: FoldFadeContainerProps) {
  const mask = `linear-gradient(to bottom, black 0%, black calc(100% - ${fadeSize}px), transparent 100%)`;
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    >
      <div
        className="h-full overflow-y-auto"
        style={{ scrollbarWidth: 'none', paddingBottom: fadeSize }}
      >
        {children}
      </div>
    </div>
  );
}
