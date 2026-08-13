import {
  Asset,
  BASE_FEE,
  Horizon,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_PASSPHRASE, USDC_ASSET_CODE, USDC_ASSET_ISSUER } from "./constants";
import { signTransaction } from "./wallet";
import type { LocalCurrency } from "./types";

/**
 * Classic-layer Path Payment: converts a worker's released USDC balance into
 * a local, fiat-backed stablecoin at withdrawal time, routed through
 * whatever DEX liquidity connects the two assets. This is deliberately
 * separate from the Soroban escrow contract — by the time a worker gets
 * here, the contract has already paid out and this is just moving a
 * classic trustline balance.
 */

export interface PathQuote {
  /** Exact USDC amount being sent (matches what the caller asked for). */
  sourceAmount: string;
  /** Best available destination amount for that source amount, before slippage tolerance. */
  destinationAmount: string;
  /** The intermediate asset hops Horizon found, if any. */
  path: Asset[];
}

export class NoPathFoundError extends Error {
  constructor(currency: LocalCurrency) {
    super(
      `No liquidity path found from USDC to ${currency.code} right now. This usually means ` +
        `there's no DEX offer connecting the two assets on this network yet.`
    );
  }
}

function usdcAsset(): Asset {
  if (!USDC_ASSET_ISSUER) {
    throw new Error("NEXT_PUBLIC_USDC_ASSET_ISSUER isn't configured — see .env.local.example.");
  }
  return new Asset(USDC_ASSET_CODE, USDC_ASSET_ISSUER);
}

function localAsset(currency: LocalCurrency): Asset {
  if (!currency.issuer) {
    throw new Error(`No issuer configured for ${currency.code} — see .env.local.example.`);
  }
  return new Asset(currency.code, currency.issuer);
}

/** Looks up the best available conversion for a given USDC send amount. */
export async function quotePath(
  destination: string,
  currency: LocalCurrency,
  sourceAmount: string
): Promise<PathQuote> {
  const server = new Horizon.Server(HORIZON_URL);
  const dest = localAsset(currency);

  const { records } = await server.strictSendPaths(usdcAsset(), sourceAmount, destination).call();
  if (records.length === 0) {
    throw new NoPathFoundError(currency);
  }

  // Horizon returns paths sorted with the best destination_amount first.
  const best = records.find((r) => r.destination_asset_code === dest.getCode()) ?? records[0];

  return {
    sourceAmount,
    destinationAmount: best.destination_amount,
    path: best.path.map((p) =>
      p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code, p.asset_issuer)
    ),
  };
}

/**
 * Builds, signs (via Freighter), and submits a strict-send Path Payment from
 * the connected worker's USDC balance into `currency`. `slippageBps` guards
 * against the quoted rate moving between `quotePath` and submission — the
 * transaction fails outright rather than accepting a worse rate.
 */
export async function executePathPayment(params: {
  sourceAddress: string;
  currency: LocalCurrency;
  quote: PathQuote;
  slippageBps?: number;
}): Promise<string> {
  const { sourceAddress, currency, quote, slippageBps = 100 } = params; // default 1% slippage tolerance
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(sourceAddress);

  const destMinFactor = 1 - slippageBps / 10_000;
  const destMin = (Number(quote.destinationAmount) * destMinFactor).toFixed(7);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: usdcAsset(),
        sendAmount: quote.sourceAmount,
        destination: sourceAddress, // self-payment: same account, different asset balance
        destAsset: localAsset(currency),
        destMin,
        path: quote.path,
      })
    )
    .setTimeout(60)
    .build();

  const { signedTxXdr } = await signTransaction(transaction.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: sourceAddress,
  });

  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const response = await server.submitTransaction(signedTx);
  return response.hash;
}
