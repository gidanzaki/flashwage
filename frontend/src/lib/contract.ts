import { Client, type Result } from "@stellar/stellar-sdk/contract";
import { ESCROW_CONTRACT_ID, NETWORK_PASSPHRASE, SOROBAN_RPC_URL } from "./constants";
import type { Escrow, EscrowStatus, PlatformConfig } from "./types";
import { signTransaction } from "./wallet";

/**
 * Thin, hand-written client for the FlashWage escrow contract, built on top
 * of `@stellar/stellar-sdk`'s generic `contract.Client`. `Client.from(...)`
 * reads the contract's on-chain spec and adds one method per contract
 * function at runtime — which is convenient, but means TypeScript has no way
 * to know those methods exist. `ContractMethods` below is that missing type,
 * kept by hand in sync with `contracts/flashwage_escrow/src/lib.rs`'s public
 * functions (there are only six, so this is easy to keep honest — if this
 * project grows a code-generation step via `stellar contract bindings
 * typescript`, this file is what that would replace).
 *
 * Every Rust function here that returns `Result<T, Error>` — every one
 * except `get_escrow_count`, which just returns `u64` — comes back from the
 * SDK as a `Result<T>` wrapper (`.unwrap()` / `.isOk()` / `.isErr()`), not as
 * `T` directly. This isn't a version quirk to work around once; it's the
 * SDK's actual `AssembledTransaction`/`SentTransaction` contract for any
 * Result-returning method, confirmed by exercising every one of these calls
 * against a real deployed instance of this contract on testnet — the raw
 * shape a `Result<T, Error>` method's `.result` field is *actually* `{ value:
 * T }` (`Ok`) or `{ error: { message } }` (`Err`), not `T` itself. Missing
 * this earlier is exactly why that verification mattered more than the type
 * checker compiling cleanly.
 */

interface RawEscrow {
  id: bigint;
  employer: string;
  worker: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  description: string;
  status: { tag: EscrowStatus };
}

interface RawConfig {
  admin: string;
  accepted_assets: string[];
  platform_fee_bps: number;
  fee_vault: string;
}

type MethodOptions = { fee?: string; timeoutInSeconds?: number; simulate?: boolean };

interface ContractMethods {
  create_milestone_escrow(
    args: {
      employer: string;
      worker: string;
      amount: bigint;
      token_address: string;
      deadline: bigint;
      description: string;
    },
    options?: MethodOptions
  ): Promise<{
    signAndSend(): Promise<{ result: Result<bigint> }>;
    result: Result<bigint>;
  }>;

  release_payout(
    args: { caller: string; escrow_id: bigint },
    options?: MethodOptions
  ): Promise<{
    signAndSend(): Promise<{ result: Result<void> }>;
    result: Result<void>;
  }>;

  cancel_escrow(
    args: { employer: string; escrow_id: bigint },
    options?: MethodOptions
  ): Promise<{
    signAndSend(): Promise<{ result: Result<void> }>;
    result: Result<void>;
  }>;

  get_escrow(
    args: { escrow_id: bigint },
    options?: MethodOptions
  ): Promise<{ result: Result<RawEscrow> }>;

  get_config(options?: MethodOptions): Promise<{ result: Result<RawConfig> }>;

  // The only method whose Rust signature doesn't return a Result — plain u64
  // straight through, no unwrap() needed.
  get_escrow_count(options?: MethodOptions): Promise<{ result: bigint }>;
}

type FlashWageClient = Client & ContractMethods;

function assertContractConfigured() {
  if (!ESCROW_CONTRACT_ID) {
    throw new Error(
      "NEXT_PUBLIC_ESCROW_CONTRACT_ID isn't set. Copy .env.local.example to .env.local and fill in a deployed contract ID."
    );
  }
}

/** Read-only client — no wallet needed, just simulates against the RPC. */
async function getReadClient(): Promise<FlashWageClient> {
  assertContractConfigured();
  const client = await Client.from({
    contractId: ESCROW_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
  });
  return client as FlashWageClient;
}

/** Write-capable client, signed by whichever address is passed in. */
async function getWriteClient(address: string): Promise<FlashWageClient> {
  assertContractConfigured();
  const client = await Client.from({
    contractId: ESCROW_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    publicKey: address,
    signTransaction,
  });
  return client as FlashWageClient;
}

export function fromRawEscrow(raw: RawEscrow): Escrow {
  return {
    id: raw.id,
    employer: raw.employer,
    worker: raw.worker,
    token: raw.token,
    amount: raw.amount,
    deadline: raw.deadline,
    description: raw.description,
    // Rust enum variants without payloads decode to `{ tag: "VariantName" }`.
    status: raw.status.tag,
  };
}

export function fromRawConfig(raw: RawConfig): PlatformConfig {
  return {
    admin: raw.admin,
    acceptedAssets: raw.accepted_assets,
    platformFeeBps: raw.platform_fee_bps,
    feeVault: raw.fee_vault,
  };
}

/** Turns whatever the SDK throws into a message worth showing a user. */
export function describeContractError(err: unknown): string {
  if (err instanceof Error) {
    // Result.unwrap() throws `new Error(this.error.message)` for a parsed
    // #[contracterror] variant, so `.message` is already the variant name
    // (e.g. "EscrowNotFound") — good enough for an MVP without a full
    // error-code-to-copy mapping table.
    return err.message;
  }
  return "Something went wrong talking to the contract.";
}

export async function fetchEscrow(escrowId: bigint): Promise<Escrow | null> {
  try {
    const client = await getReadClient();
    const { result } = await client.get_escrow({ escrow_id: escrowId });
    return fromRawEscrow(result.unwrap());
  } catch {
    return null; // most commonly: EscrowNotFound
  }
}

export async function fetchEscrowCount(): Promise<bigint> {
  const client = await getReadClient();
  const { result } = await client.get_escrow_count();
  return result;
}

export async function fetchConfig(): Promise<PlatformConfig | null> {
  try {
    const client = await getReadClient();
    const { result } = await client.get_config();
    return fromRawConfig(result.unwrap());
  } catch {
    return null; // most commonly: contract not initialized yet
  }
}

/**
 * There's no on-chain index of "escrows where address X is the worker/
 * employer" — see the note on `get_escrow_count` in the contract. This
 * enumerates every escrow and filters client-side, which is fine at the
 * escrow counts an early-stage platform actually has; swap for an indexed
 * backend (or `getEvents`-based discovery) if that stops being true.
 */
export async function fetchEscrowsForAddress(
  address: string,
  role: "employer" | "worker"
): Promise<Escrow[]> {
  const count = await fetchEscrowCount();
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const escrows = await Promise.all(ids.map(fetchEscrow));
  return escrows
    .filter((e): e is Escrow => e !== null && e[role] === address)
    .sort((a, b) => Number(b.id - a.id)); // newest first
}

export async function createMilestoneEscrow(params: {
  employer: string;
  worker: string;
  amount: bigint;
  tokenAddress: string;
  deadline: bigint;
  description: string;
}): Promise<bigint> {
  const client = await getWriteClient(params.employer);
  const tx = await client.create_milestone_escrow({
    employer: params.employer,
    worker: params.worker,
    amount: params.amount,
    token_address: params.tokenAddress,
    deadline: params.deadline,
    description: params.description,
  });
  const sent = await tx.signAndSend();
  return sent.result.unwrap();
}

export async function releasePayout(params: { caller: string; escrowId: bigint }): Promise<void> {
  const client = await getWriteClient(params.caller);
  const tx = await client.release_payout({ caller: params.caller, escrow_id: params.escrowId });
  const sent = await tx.signAndSend();
  sent.result.unwrap();
}

export async function cancelEscrow(params: { employer: string; escrowId: bigint }): Promise<void> {
  const client = await getWriteClient(params.employer);
  const tx = await client.cancel_escrow({ employer: params.employer, escrow_id: params.escrowId });
  const sent = await tx.signAndSend();
  sent.result.unwrap();
}
