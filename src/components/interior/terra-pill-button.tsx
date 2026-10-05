import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

interface CommonProps {
  size?: 'sm' | 'md';
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

interface AsLinkProps extends CommonProps {
  href: string;
  onClick?: undefined;
  type?: undefined;
  disabled?: undefined;
}

interface AsButtonProps extends CommonProps {
  href?: undefined;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

type Props = AsLinkProps | AsButtonProps;

const sizeClasses: Record<NonNullable<CommonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-[10px]',
  md: 'px-4 py-2.5 text-xs',
};

const baseClasses =
  'inline-flex items-center gap-1.5 rounded-full font-semibold tracking-[0.02em] whitespace-nowrap transition-all active:scale-[0.98]';

/**
 * Terra primary CTA pill. Used for highest-stakes commits — Submit on the
 * wizard, "Add room" on listing detail, "Download" in the reveal footer.
 */
export function TerraPillButton(props: Props) {
  const { size = 'md', iconLeft, iconRight, className, children } = props;
  const cls = cn(
    baseClasses,
    'bg-sr-terra text-white border border-sr-terra hover:bg-sr-terra/90',
    sizeClasses[size],
    className,
  );
  const content = (
    <>
      {iconLeft}
      {children}
      {iconRight}
    </>
  );
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(cls, 'disabled:opacity-50 disabled:cursor-not-allowed')}
    >
      {content}
    </button>
  );
}

/**
 * Dark navy CTA pill. Used for empty-state CTAs and Continue buttons.
 */
export function DarkPillButton(props: Props) {
  const { size = 'md', iconLeft, iconRight, className, children } = props;
  const cls = cn(
    baseClasses,
    'bg-sr-ink text-white border border-sr-ink hover:bg-sr-ink-2',
    sizeClasses[size],
    className,
  );
  const content = (
    <>
      {iconLeft}
      {children}
      {iconRight}
    </>
  );
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(cls, 'disabled:opacity-50 disabled:cursor-not-allowed')}
    >
      {content}
    </button>
  );
}
