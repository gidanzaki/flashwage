"use client";

import { useState, type FormEvent } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { Loader2, Plus } from "lucide-react";
import { useWallet } from "./WalletProvider";
import { createMilestoneEscrow, describeContractError } from "@/lib/contract";
import { datetimeLocalToUnixSeconds, parseTokenAmount } from "@/lib/format";
import { USDC_CONTRACT_ID } from "@/lib/constants";

interface CreateEscrowFormProps {
  onCreated?: (escrowId: bigint) => void;
}

export function CreateEscrowForm({ onCreated }: CreateEscrowFormProps) {
  const { address, connect } = useWallet();
  const [worker, setWorker] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!address) {
      await connect();
      return;
    }
    if (!USDC_CONTRACT_ID) {
      setError("NEXT_PUBLIC_USDC_CONTRACT_ID isn't configured — see .env.local.example.");
      return;
    }
    if (!StrKey.isValidEd25519PublicKey(worker)) {
      setError("That doesn't look like a valid Stellar address (should start with G…).");
      return;
    }

    let amountUnits: bigint;
    let deadlineSeconds: bigint;
    try {
      amountUnits = parseTokenAmount(amount);
      if (amountUnits <= 0n) throw new Error("Amount must be greater than zero.");
      deadlineSeconds = datetimeLocalToUnixSeconds(deadline);
      if (deadlineSeconds <= BigInt(Math.floor(Date.now() / 1000))) {
        throw new Error("Deadline needs to be in the future.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the amount and deadline fields.");
      return;
    }

    setSubmitting(true);
    try {
      const escrowId = await createMilestoneEscrow({
        employer: address,
        worker,
        amount: amountUnits,
        tokenAddress: USDC_CONTRACT_ID,
        deadline: deadlineSeconds,
        description,
      });
      setSuccess(`Escrow #${escrowId} created and funded.`);
      setWorker("");
      setAmount("");
      setDescription("");
      setDeadline("");
      onCreated?.(escrowId);
    } catch (err) {
      setError(describeContractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel gradient-border space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold">New milestone escrow</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Funds move from your wallet into the contract the moment you submit this.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="worker" className="text-xs font-medium text-[var(--muted-strong)]">
          Worker&apos;s Stellar address
        </label>
        <input
          id="worker"
          value={worker}
          onChange={(e) => setWorker(e.target.value)}
          placeholder="GABC...WXYZ"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 font-mono text-sm outline-none transition focus:border-[var(--accent-violet)]"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="amount" className="text-xs font-medium text-[var(--muted-strong)]">
            Amount (USDC)
          </label>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="250.00"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-violet)]"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="deadline" className="text-xs font-medium text-[var(--muted-strong)]">
            Deadline
          </label>
          <input
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-violet)]"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-xs font-medium text-[var(--muted-strong)]">
          Milestone description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ship v1 of the landing page"
          rows={2}
          maxLength={200}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-violet)]"
          required
        />
      </div>

      {error && (
        <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-3 py-2 text-sm text-[var(--success)]">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--accent-gradient)] px-4 py-2.5 text-sm font-semibold text-[#06070f] transition hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {submitting ? "Locking funds…" : address ? "Create & fund escrow" : "Connect wallet to continue"}
      </button>
    </form>
  );
}
