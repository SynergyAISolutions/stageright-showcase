'use client';

import { useEffect, useState, useCallback } from 'react';

type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  plan: string;
  creditsRemaining: number;
  creditsUsedAllTime: number;
  updatedAt: string;
  stripeCustomerId: string | null;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [granting, setGranting] = useState<AdminUserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/users');
      if (r.ok) {
        const data = await r.json();
        setRows(data.users);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search.trim()
    ? rows.filter((r) => r.email.toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <header className="bg-white border-b border-surface-border sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-14 flex items-center justify-between">
          <h1 className="font-heading text-xl text-brand-navy">Users</h1>
          <a href="/dashboard" className="text-sm font-medium text-ink-muted hover:text-brand-navy">Dashboard</a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
        <div className="mb-5 flex items-center gap-3">
          <input
            type="search"
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm text-sm bg-white border border-surface-border rounded-lg px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy/40"
          />
          <span className="text-sm text-ink-muted">
            {loading ? 'Loading…' : `${filtered.length} of ${rows.length}`}
          </span>
        </div>

        <div className="bg-white border border-surface-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Credits</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-surface-secondary/40">
                  <td className="px-4 py-3 text-brand-navy font-medium">{u.email}</td>
                  <td className="px-4 py-3 text-ink-secondary">{u.name}</td>
                  <td className="px-4 py-3 text-ink-secondary">{u.plan}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.creditsRemaining}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{u.creditsUsedAllTime}</td>
                  <td className="px-4 py-3 text-ink-muted text-xs">{relativeTime(u.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setGranting(u)}
                      className="inline-flex items-center justify-center size-7 rounded-full bg-brand-navy text-white text-base leading-none hover:bg-brand-navy/90 transition-colors"
                      aria-label={`Add credits to ${u.email}`}
                    >
                      +
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">No users match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {granting && (
        <AddCreditsModal
          user={granting}
          onClose={() => setGranting(null)}
          onSuccess={(newBalance) => {
            setRows((prev) => prev.map((r) => r.id === granting.id ? { ...r, creditsRemaining: newBalance } : r));
            setGranting(null);
          }}
        />
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function AddCreditsModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}) {
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not grant credits.');
        return;
      }
      onSuccess(user.creditsRemaining + amount);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl border border-surface-border shadow-[0_24px_48px_-12px_rgba(15,29,46,0.25)] p-6"
      >
        <h2 className="font-heading text-lg text-brand-navy">Add credits</h2>
        <p className="mt-1 text-sm text-ink-muted truncate">{user.email}</p>

        <label className="block mt-5">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted mb-1.5">Credits to add</span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
            required
            className="w-full text-sm bg-surface-secondary border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
          />
        </label>

        <label className="block mt-3">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted mb-1.5">Reason (audit log)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder='e.g. "Test account"'
            className="w-full text-sm bg-surface-secondary border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm font-medium text-ink-muted hover:text-brand-navy px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || reason.trim().length < 3 || amount < 1}
            className="text-sm font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Granting…' : `Add ${amount}`}
          </button>
        </div>
      </form>
    </div>
  );
}
