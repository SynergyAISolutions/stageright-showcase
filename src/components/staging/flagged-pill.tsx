export function FlaggedPill() {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-brand-teal bg-brand-teal/10 border border-brand-teal/20 rounded-full px-3 py-1.5">
      <span className="size-1.5 rounded-full bg-brand-teal" />
      Under review — we will email you within 24h
    </span>
  );
}
