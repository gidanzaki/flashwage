import type { LocalCurrency } from "./types";

/**
 * All network/contract configuration lives here, sourced from env vars so
 * the same build can point at testnet, futurenet, or mainnet without a code
 * change. See `.env.local.example` for what needs filling in.
 */
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

/** The deployed FlashWage escrow contract's C... address. */
export const ESCROW_CONTRACT_ID = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ?? "";

/** The accepted deposit token's contract address (a Stellar Asset Contract, e.g. USDC). */
export const USDC_CONTRACT_ID = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? "";

/**
 * The *classic*-layer counterpart of the same USDC asset: its 4-char code and
 * issuer G... account. A Stellar Asset Contract is just the Soroban-side view
 * of a classic asset — when the escrow contract pays a worker, the balance
 * lands as an ordinary classic trustline balance too, which is what makes a
 * classic-layer Path Payment (see lib/pathPayment.ts) possible on withdrawal.
 * These are deliberately separate from USDC_CONTRACT_ID above, which the
 * Soroban contract calls need in C... form.
 */
export const USDC_ASSET_CODE = process.env.NEXT_PUBLIC_USDC_ASSET_CODE ?? "USDC";
export const USDC_ASSET_ISSUER = process.env.NEXT_PUBLIC_USDC_ASSET_ISSUER ?? "";

/** Smallest-unit decimals for Stellar Asset Contracts (USDC, EURC, XLM, ...). */
export const TOKEN_DECIMALS = 7;

/**
 * Local, fiat-backed stablecoins a worker can off-ramp into via a Path
 * Payment at withdrawal time. Issuer addresses are network-specific — fill
 * these in for whichever network you're pointed at (see README). Left empty
 * by default rather than hardcoding real mainnet issuers here, since a wrong
 * issuer address is a real way to send someone's payout into a void.
 */
const ALL_LOCAL_CURRENCIES: LocalCurrency[] = [
  {
    code: "ARS",
    label: "Argentine Peso (ARS)",
    issuer: process.env.NEXT_PUBLIC_ARS_ISSUER ?? "",
  },
  {
    code: "BRL",
    label: "Brazilian Real (BRL)",
    issuer: process.env.NEXT_PUBLIC_BRL_ISSUER ?? "",
  },
  {
    code: "EURC",
    label: "Euro Coin (EURC)",
    issuer: process.env.NEXT_PUBLIC_EURC_ISSUER ?? "",
  },
];

/** Only the currencies that actually have an issuer configured — see .env.local.example. */
export const LOCAL_CURRENCIES: LocalCurrency[] = ALL_LOCAL_CURRENCIES.filter((c) => c.issuer);

export const PLATFORM_FEE_BPS_FALLBACK = 50; // 0.5%, mirrors the contract default used at deploy time
