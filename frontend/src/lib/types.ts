/**
 * Mirrors the data shapes defined in the Soroban contract
 * (`contracts/flashwage_escrow/src/lib.rs`). Kept as a single source of truth
 * on the frontend side so every component agrees on what an escrow looks
 * like — if the contract's `Escrow` struct changes, this is the file to
 * update to match.
 */

export type EscrowStatus = "Active" | "Released" | "Canceled";

export interface Escrow {
  id: bigint;
  employer: string;
  worker: string;
  token: string;
  /** Smallest-unit amount (7 decimals for most Stellar assets, incl. USDC). */
  amount: bigint;
  /** Unix seconds. */
  deadline: bigint;
  description: string;
  status: EscrowStatus;
}

export interface PlatformConfig {
  admin: string;
  acceptedAssets: string[];
  platformFeeBps: number;
  feeVault: string;
}

/** A locally-tracked currency the worker can withdraw into via Path Payment. */
export interface LocalCurrency {
  code: string;
  label: string;
  /** Issuer address for the destination asset on the configured network. */
  issuer: string;
}
