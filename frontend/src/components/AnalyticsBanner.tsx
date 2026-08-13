"use client";

import { useEffect, useState } from "react";
import { Lock, SendHorizontal, Timer } from "lucide-react";
import { StatCard } from "./StatCard";
import { fetchEscrowCount, fetchEscrow } from "@/lib/contract";
import { formatUsd } from "@/lib/format";
import type { Escrow } from "@/lib/types";

interface Totals {
  tvl: bigint;
  disbursed: bigint;
  escrowCount: number;
}

/**
 * Reads every escrow the contract has ever created and sums them up
 * client-side — same "no indexer yet" tradeoff as `fetchEscrowsForAddress`
 * in lib/contract.ts. Fine for the escrow volumes an early platform sees;
 * swap for a real events pipeline if this page starts feeling slow.
 */
export function AnalyticsBanner() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // fetchEscrowCount() throws if ESCROW_CONTRACT_ID isn't configured,
      // which the catch below already turns into `unavailable` — no need
      // for a separate synchronous check before this async work starts.
      try {
        const count = await fetchEscrowCount();
        const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
        const escrows = (await Promise.all(ids.map(fetchEscrow))).filter(
          (e): e is Escrow => e !== null
        );
        if (cancelled) return;

        const totals = escrows.reduce(
          (acc, e) => {
            if (e.status === "Active") acc.tvl += e.amount;
            if (e.status === "Released") acc.disbursed += e.amount;
            return acc;
          },
          { tvl: 0n, disbursed: 0n }
        );

        setTotals({ ...totals, escrowCount: escrows.length });
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        icon={Lock}
        label="Total Value Locked"
        value={unavailable ? "—" : formatUsd(totals?.tvl ?? 0n)}
        hint={unavailable ? "Contract not connected" : "Across all active milestones"}
        loading={!unavailable && totals === null}
      />
      <StatCard
        icon={SendHorizontal}
        label="Total Disbursed"
        value={unavailable ? "—" : formatUsd(totals?.disbursed ?? 0n)}
        hint={unavailable ? "Contract not connected" : "Paid out to workers to date"}
        loading={!unavailable && totals === null}
      />
      <StatCard
        icon={Timer}
        label="Avg. Settlement Time"
        value="~5s"
        hint="Stellar ledger close time, not a per-escrow average"
      />
    </div>
  );
}
