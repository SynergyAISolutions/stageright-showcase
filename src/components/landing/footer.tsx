import Image from 'next/image';
import Link from 'next/link';

const PRODUCT_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#styles', label: 'Styles' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

const COMPANY_LINKS = [
  { href: '/terms', label: 'Terms of service' },
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/contact', label: 'Contact' },
] as const;

const ACCOUNT_LINKS = [
  { href: '/login', label: 'Sign in' },
  { href: '/onboarding', label: 'Get started' },
] as const;

const LogoMark = () => (
  <Image
    src="/icons/android/logo-mark-light.png"
    alt=""
    width={36}
    height={36}
    className="size-9 shrink-0 object-contain"
  />
);

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-sr-hairline bg-sr-cream pt-16 pb-8">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
        <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-8 md:gap-12 lg:gap-14 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1 max-w-[320px]">
            <Link href="/" className="flex items-center gap-2.5 text-sr-ink">
              <LogoMark />
              <span
                className="font-display text-[22px] leading-none tracking-[-0.015em]"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 50' }}
              >
                Stage
                <em
                  className="not-italic font-display text-sr-terra italic font-light"
                  style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}
                >
                  Right
                </em>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-[1.6] text-sr-ink-soft">
              AI virtual staging for real estate. Photorealistic interiors in just minutes. Built
              in Australia.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sr-ink-mute mb-4">
              Product
            </h4>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-sr-ink-soft hover:text-sr-terra transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sr-ink-mute mb-4">
              Company
            </h4>
            <ul className="space-y-2.5">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-sr-ink-soft hover:text-sr-terra transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sr-ink-mute mb-4">
              Account
            </h4>
            <ul className="space-y-2.5">
              {ACCOUNT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-sr-ink-soft hover:text-sr-terra transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-sr-hairline flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[13px] text-sr-ink-mute">
          <span>&copy; {new Date().getFullYear()} StageRight. Built in Australia.</span>
          <span>Images are AI generated and may vary.</span>
        </div>
      </div>
    </footer>
  );
}
