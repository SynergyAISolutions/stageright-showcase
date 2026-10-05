'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';

export function ListingCopyButton({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/listing-copy"
      className={
        className ??
        'inline-flex items-center gap-2 rounded-full border border-sr-hairline bg-sr-surface px-4 py-2.5 text-[13px] font-medium text-sr-ink hover:border-sr-terra/50 hover:bg-sr-terra/5 transition-colors'
      }
    >
      <FileText className="size-4" />
      Listing copy
    </Link>
  );
}
