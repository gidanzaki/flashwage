import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}

export function StatCard({ icon: Icon, label, value, hint, loading }: StatCardProps) {
  return (
    <div className="panel gradient-border relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]">
          <Icon className="h-4 w-4 text-[var(--accent-cyan)]" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        {loading ? (
          <span className="inline-block h-7 w-24 animate-pulse rounded bg-[var(--surface-hover)]" />
        ) : (
          value
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
