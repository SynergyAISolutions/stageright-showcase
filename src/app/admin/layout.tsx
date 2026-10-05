import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    redirect('/dashboard');
  }
  return (
    <>
      <nav className="bg-brand-navy text-white border-b border-brand-navy/40">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-12 flex items-center gap-1 text-[13px]">
          <Link href="/dashboard" className="px-3 h-8 rounded-md inline-flex items-center text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors">← Dashboard</Link>
          <span className="mx-2 text-white/30" aria-hidden>·</span>
          <span className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Admin</span>
          <Link href="/admin/compare" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Compare models</Link>
          <Link href="/admin/reviews" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Review queue</Link>
          <Link href="/admin/landing-images" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Landing images</Link>
          <Link href="/admin/users" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Users</Link>
        </div>
      </nav>
      {children}
    </>
  );
}
