import { cn } from '@/lib/utils/cn';

interface TileGridProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Uniform tile grid used by the dashboard, listing detail, and gallery.
 * Mobile: 2 cols. Tablet: 3 cols. Laptop+: 4 cols. Tailwind 3.4's grid-cols-N
 * uses repeat(N, minmax(0, 1fr)) so intrinsic content widths can't drift
 * columns unequal.
 */
export function TileGrid({ children, className }: TileGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
        'gap-2 sm:gap-3.5 lg:gap-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
