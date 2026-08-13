"use client";

/**
 * Thin wrapper around `@stellar/freighter-api`. Kept in one file so the rest
 * of the app talks to "the wallet" through a handful of plain functions
 * instead of importing the Freighter package directly everywhere — that's
 * also the seam where Passkey wallet support (see README roadmap) would get
 * plugged in later without touching every component that signs something.
 */
import freighterApi from "@stellar/freighter-api";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";

export class WalletError extends Error {}

/** Is the Freighter browser extension installed and reachable at all? */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const { isConnected, error } = await freighterApi.isConnected();
    return !error && isConnected;
  } catch {
    return false;
  }
}

/**
 * Prompts the user to connect (if not already authorized) and returns their
 * public address. This is the only call that triggers Freighter's "allow
 * this site" popup — everything else assumes access was already granted.
 */
export async function connectWallet(): Promise<string> {
  const installed = await isFreighterInstalled();
  if (!installed) {
    throw new WalletError(
      "Freighter wallet isn't installed. Get it from freighter.app, then reload this page."
    );
  }

  const { address, error } = await freighterApi.requestAccess();
  if (error || !address) {
    throw new WalletError(error?.message ?? "Freighter didn't return an address.");
  }
  return address;
}

/**
 * Silent check for an already-authorized connection — used on page load so
 * returning users don't have to click "Connect" again every visit.
 */
export async function getConnectedAddress(): Promise<string | null> {
  try {
    const installed = await isFreighterInstalled();
    if (!installed) return null;

    const { isAllowed } = await freighterApi.isAllowed();
    if (!isAllowed) return null;

    const { address, error } = await freighterApi.getAddress();
    if (error || !address) return null;
    return address;
  } catch {
    return null;
  }
}

/** The network Freighter is currently pointed at (e.g. "TESTNET"). */
export async function getWalletNetwork(): Promise<{ network: string; networkPassphrase: string } | null> {
  try {
    const { network, networkPassphrase, error } = await freighterApi.getNetwork();
    if (error) return null;
    return { network, networkPassphrase };
  } catch {
    return null;
  }
}

/**
 * Matches the `SignTransaction` shape `@stellar/stellar-sdk/contract`'s
 * `Client` expects, so it can be handed straight to `Client.from({ ...,
 * signTransaction })` without any adapting.
 */
export const signTransaction: SignTransaction = async (xdr, opts) => {
  const result = await freighterApi.signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase,
    address: opts?.address,
  });
  if (result.error) {
    throw new WalletError(result.error.message ?? "Freighter declined to sign the transaction.");
  }
  return { signedTxXdr: result.signedTxXdr, signerAddress: result.signerAddress };
};
