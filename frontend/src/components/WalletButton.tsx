"use client";

import { Loader2, LogOut, Wallet } from "lucide-react";
import { useWallet } from "./WalletProvider";
import { truncateAddress } from "@/lib/format";

export function WalletButton() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        onClick={disconnect}
        className="group flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--danger)]/50 hover:bg-[var(--danger)]/10"
        title="Click to disconnect"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--success)] pulse-dot" />
        <span className="font-mono">{truncateAddress(address)}</span>
        <LogOut className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={connect}
        disabled={isConnecting}
        className="flex items-center gap-2 rounded-full bg-[image:var(--accent-gradient)] px-4 py-2 text-sm font-semibold text-[#06070f] transition hover:opacity-90 disabled:opacity-60"
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        {isConnecting ? "Connecting…" : "Connect Freighter"}
      </button>
      {error && <p className="max-w-64 text-right text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
