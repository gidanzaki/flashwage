"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/components/WalletProvider";
import { EscrowCard } from "@/components/EscrowCard";
import { WithdrawFlow } from "@/components/WithdrawFlow";
import { describeContractError, fetchEscrowsForAddress, releasePayout } from "@/lib/contract";
import { isPastDeadline } from "@/lib/format";
import type { Escrow } from "@/lib/types";

export default function WorkerPage() {
  const { address, connect } = useWallet();
  const [escrows, setEscrows] = useState<Escrow[] | null>(null);
  const [busyId, setBusyId] = useState<bigint | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<Escrow | null>(null);

  // Bumping this re-triggers the fetch effect below — the only synchronous
  // state change `refresh()` needs to make, so it never has to reach into
  // the effect's own setState calls (see the comment on the effect).
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setEscrows(null);
    setReloadToken((t) => t + 1);
  }, []);

  // All setState calls here happen inside the async IIFE, after its first
  // `await` — nothing synchronous in the effect body itself. That's what
  // the react-hooks set-state-in-effect rule wants: an effect that kicks off
  // a subscription/fetch, not one that updates state before any async work
  // has actually happened.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchEscrowsForAddress(address, "worker");
        if (!cancelled) setEscrows(result);
      } catch (err) {
        if (!cancelled) {
          setActionError(describeContractError(err));
          setEscrows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, reloadToken]);

  async function handleClaim(escrow: Escrow) {
    if (!address) return;
    setBusyId(escrow.id);
    setActionError(null);
    try {
      await releasePayout({ caller: address, escrowId: escrow.id });
      refresh();
    } catch (err) {
      setActionError(describeContractError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-24 text-center">
        <Wallet className="h-8 w-8 text-[var(--muted)]" />
        <h1 className="text-2xl font-semibold">Connect your wallet to continue</h1>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Connect the wallet your milestones were assigned to see what&apos;s pending and what&apos;s
          been paid out.
        </p>
        <button
          onClick={connect}
          className="mt-2 rounded-full bg-[image:var(--accent-gradient)] px-5 py-2.5 text-sm font-semibold text-[#06070f]"
        >
          Connect Freighter
        </button>
      </div>
    );
  }

  const pending = escrows?.filter((e) => e.status === "Active") ?? [];
  const completed = escrows?.filter((e) => e.status !== "Active") ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Worker portal</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Track milestones assigned to you and withdraw payouts to a local stablecoin.
      </p>

      {actionError && (
        <p className="mt-6 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {actionError}
        </p>
      )}

      {escrows === null && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your milestones…
        </div>
      )}

      {escrows?.length === 0 && (
        <div className="panel mt-8 p-8 text-center text-sm text-[var(--muted)]">
          No milestones assigned to this address yet.
        </div>
      )}

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-[var(--muted-strong)]">
            Pending ({pending.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pending.map((escrow) => {
              const overdue = isPastDeadline(escrow.deadline);
              const isBusy = busyId === escrow.id;
              return (
                <EscrowCard
                  key={escrow.id.toString()}
                  escrow={escrow}
                  counterpartLabel="Employer"
                  counterpartAddress={escrow.employer}
                  actions={
                    overdue ? (
                      <button
                        onClick={() => handleClaim(escrow)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 rounded-lg bg-[image:var(--accent-gradient)] px-3 py-1.5 text-xs font-semibold text-[#06070f] transition hover:opacity-90 disabled:opacity-60"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
                        Claim payout
                      </button>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--muted-strong)]">
            Completed ({completed.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {completed.map((escrow) => (
              <EscrowCard
                key={escrow.id.toString()}
                escrow={escrow}
                counterpartLabel="Employer"
                counterpartAddress={escrow.employer}
                actions={
                  escrow.status === "Released" ? (
                    <button
                      onClick={() => setWithdrawing(escrow)}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface-hover)]"
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      Withdraw
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {withdrawing && (
        <WithdrawFlow
          escrow={withdrawing}
          workerAddress={address}
          onClose={() => setWithdrawing(null)}
        />
      )}
    </div>
  );
}
