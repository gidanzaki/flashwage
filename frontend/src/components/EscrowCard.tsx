import type { ReactNode } from "react";
import { Calendar, CheckCircle2, CircleDot, XCircle } from "lucide-react";
import type { Escrow } from "@/lib/types";
import { formatDeadline, formatUsd, isPastDeadline, truncateAddress } from "@/lib/format";

const statusStyles: Record<Escrow["status"], { label: string; className: string; icon: typeof CircleDot }> = {
  Active: {
    label: "Active",
    className: "bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30",
    icon: CircleDot,
  },
  Released: {
    label: "Released",
    className: "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30",
    icon: CheckCircle2,
  },
  Canceled: {
    label: "Canceled",
    className: "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/30",
    icon: XCircle,
  },
};

interface EscrowCardProps {
  escrow: Escrow;
  /** Which address to display as "the other party" — the counterpart to viewerRole. */
  counterpartLabel: string;
  counterpartAddress: string;
  actions?: ReactNode;
}

export function EscrowCard({ escrow, counterpartLabel, counterpartAddress, actions }: EscrowCardProps) {
  const status = statusStyles[escrow.status];
  const StatusIcon = status.icon;
  const overdue = escrow.status === "Active" && isPastDeadline(escrow.deadline);

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">
            {escrow.description || `Milestone #${escrow.id}`}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {counterpartLabel}:{" "}
            <span className="font-mono text-[var(--muted-strong)]">
              {truncateAddress(counterpartAddress)}
            </span>
          </p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}
        >
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xl font-semibold tracking-tight">{formatUsd(escrow.amount)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]">
            <Calendar className="h-3 w-3" />
            {escrow.status === "Active" ? (overdue ? "Deadline passed: " : "Due ") : "Deadline was "}
            {formatDeadline(escrow.deadline)}
          </p>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      {overdue && (
        <p className="mt-3 rounded-lg border border-[var(--warning)]/25 bg-[var(--warning)]/10 px-3 py-2 text-xs text-[var(--warning)]">
          Deadline has passed. Anyone can now trigger the release, or the employer can cancel for a
          refund.
        </p>
      )}
    </div>
  );
}
