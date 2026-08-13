"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Send, Undo2, Wallet } from "lucide-react";
import { useWallet } from "@/components/WalletProvider";
import { CreateEscrowForm } from "@/components/CreateEscrowForm";
import { EscrowCard } from "@/components/EscrowCard";
import { cancelEscrow, describeContractError, fetchEscrowsForAddress, releasePayout } from "@/lib/contract";
import { isPastDeadline } from "@/lib/format";
import type { Escrow } from "@/lib/types";

export default function EmployerPage() {
  const { address, connect } = useWallet();
  const [escrows, setEscrows] = useState<Escrow[] | null>(null);
  const [busyId, setBusyId] = useState<bigint | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
        const result = await fetchEscrowsForAddress(address, "employer");
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

  async function handleRelease(escrow: Escrow) {
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

  async function handleCancel(escrow: Escrow) {
    if (!address) return;
    setBusyId(escrow.id);
    setActionError(null);
    try {
      await cancelEscrow({ employer: address, escrowId: escrow.id });
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
          The employer dashboard needs a connected Freighter wallet to create and manage escrows.
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Employer dashboard</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Create milestone escrows and release payouts once work is delivered.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <CreateEscrowForm onCreated={refresh} />

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--muted-strong)]">Your escrows</h2>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {actionError && (
            <p className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {actionError}
            </p>
          )}

          {escrows === null && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading escrows…
            </div>
          )}

          {escrows?.length === 0 && (
            <div className="panel p-8 text-center text-sm text-[var(--muted)]">
              No escrows yet — create your first milestone to get started.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {escrows?.map((escrow) => {
              const overdue = escrow.status === "Active" && isPastDeadline(escrow.deadline);
              const isBusy = busyId === escrow.id;
              return (
                <EscrowCard
                  key={escrow.id.toString()}
                  escrow={escrow}
                  counterpartLabel="Worker"
                  counterpartAddress={escrow.worker}
                  actions={
                    escrow.status === "Active" ? (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleRelease(escrow)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 rounded-lg bg-[image:var(--accent-gradient)] px-3 py-1.5 text-xs font-semibold text-[#06070f] transition hover:opacity-90 disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Release
                        </button>
                        {overdue && (
                          <button
                            onClick={() => handleCancel(escrow)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface-hover)] disabled:opacity-60"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Cancel & refund
                          </button>
                        )}
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
