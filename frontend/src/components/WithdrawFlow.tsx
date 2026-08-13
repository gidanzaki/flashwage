"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Loader2, SendHorizontal, X } from "lucide-react";
import { LOCAL_CURRENCIES } from "@/lib/constants";
import { formatTokenAmount, parseTokenAmount } from "@/lib/format";
import { executePathPayment, quotePath, type PathQuote } from "@/lib/pathPayment";
import type { Escrow, LocalCurrency } from "@/lib/types";

interface WithdrawFlowProps {
  escrow: Escrow;
  workerAddress: string;
  onClose: () => void;
}

type Step = "select" | "quoting" | "quoted" | "submitting" | "done";

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="panel relative w-full max-w-sm p-6">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function WithdrawFlow({ escrow, workerAddress, onClose }: WithdrawFlowProps) {
  const amountStr = formatTokenAmount(escrow.amount);

  if (LOCAL_CURRENCIES.length === 0) {
    return (
      <Modal onClose={onClose}>
        <div className="space-y-3 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[var(--warning)]" />
          <h3 className="text-base font-semibold">No off-ramp currencies configured</h3>
          <p className="text-sm text-[var(--muted)]">
            None of the local currency issuers (ARS/BRL/EURC) are set in this deployment&apos;s
            environment. Your {amountStr} USDC is still safely in your wallet — see{" "}
            <code className="text-xs">.env.local.example</code> to enable withdrawal.
          </p>
        </div>
      </Modal>
    );
  }

  return <WithdrawFlowInner escrow={escrow} workerAddress={workerAddress} onClose={onClose} amountStr={amountStr} />;
}

function WithdrawFlowInner({
  escrow,
  workerAddress,
  onClose,
  amountStr,
}: WithdrawFlowProps & { amountStr: string }) {
  const [currency, setCurrency] = useState<LocalCurrency>(LOCAL_CURRENCIES[0]);
  const [step, setStep] = useState<Step>("select");
  const [quote, setQuote] = useState<PathQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleQuote() {
    setError(null);
    setStep("quoting");
    try {
      const q = await quotePath(workerAddress, currency, amountStr);
      setQuote(q);
      setStep("quoted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't find a conversion path.");
      setStep("select");
    }
  }

  async function handleConfirm() {
    if (!quote) return;
    setError(null);
    setStep("submitting");
    try {
      const hash = await executePathPayment({ sourceAddress: workerAddress, currency, quote });
      setTxHash(hash);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment couldn't be submitted.");
      setStep("quoted");
    }
  }

  return (
    <Modal onClose={onClose}>
      <div>
        <h3 className="text-base font-semibold">Withdraw to local currency</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {amountStr} USDC from &ldquo;{escrow.description || `Milestone #${escrow.id}`}&rdquo;
        </p>
      </div>

      {step === "done" ? (
        <div className="mt-6 space-y-3 text-center">
          <SendHorizontal className="mx-auto h-8 w-8 text-[var(--success)]" />
          <p className="text-sm">Sent! Your {currency.code} should land in seconds.</p>
          {txHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--accent-cyan)] hover:underline"
            >
              View transaction
            </a>
          )}
          <button
            onClick={onClose}
            className="mt-2 w-full rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-hover)]"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-strong)]">Convert to</label>
            <select
              value={currency.code}
              onChange={(e) => {
                const next = LOCAL_CURRENCIES.find((c) => c.code === e.target.value);
                if (next) {
                  setCurrency(next);
                  setStep("select");
                  setQuote(null);
                }
              }}
              disabled={step === "quoting" || step === "submitting"}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-violet)]"
            >
              {LOCAL_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {quote && step === "quoted" && (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-sm">
              <span>{formatTokenAmount(parseTokenAmount(quote.sourceAmount))} USDC</span>
              <ArrowRight className="h-4 w-4 text-[var(--muted)]" />
              <span className="font-semibold text-[var(--accent-cyan)]">
                ≈ {quote.destinationAmount} {currency.code}
              </span>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            onClick={step === "quoted" ? handleConfirm : handleQuote}
            disabled={step === "quoting" || step === "submitting"}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--accent-gradient)] px-4 py-2.5 text-sm font-semibold text-[#06070f] transition hover:opacity-90 disabled:opacity-60"
          >
            {(step === "quoting" || step === "submitting") && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {step === "quoting" && "Finding best rate…"}
            {step === "submitting" && "Sending…"}
            {step === "select" && "Get rate"}
            {step === "quoted" && "Confirm withdrawal"}
          </button>
        </>
      )}
    </Modal>
  );
}
