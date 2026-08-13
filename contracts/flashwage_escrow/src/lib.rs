//! # FlashWage Escrow Contract
//!
//! A milestone-based escrow contract for the FlashWage micro-payroll platform.
//!
//! ## How it works
//! 1. A platform `admin` calls [`FlashWageEscrow::initialize`] once, configuring
//!    which tokens (e.g. a USDC Stellar Asset Contract) are accepted and the
//!    platform's cut of every payout, in basis points (bps).
//! 2. An `employer` calls [`FlashWageEscrow::create_milestone_escrow`], which pulls
//!    `amount` of the chosen token from the employer's wallet into this contract's
//!    custody and records a new [`Escrow`] for a given `worker`.
//! 3. Once the milestone is complete, the `employer` (or the platform `admin`) calls
//!    [`FlashWageEscrow::release_payout`] to pay the worker. The payout is split
//!    automatically: `platform_fee_bps` goes to the platform's fee vault, the rest
//!    goes to the worker. If the employer never releases and the milestone's
//!    `deadline` passes, **anyone** may trigger the release as a safety valve so a
//!    worker's funds are never permanently stuck behind an unresponsive employer.
//! 4. If the deadline passes with no release, the `employer` may instead call
//!    [`FlashWageEscrow::cancel_escrow`] to reclaim the locked funds.
//!
//! ## Storage layout
//! - **Instance storage** holds the small, frequently-read [`Config`] and the
//!   escrow id counter — cheap to bump and always resident while the contract is
//!   "live".
//! - **Persistent storage** holds each individual [`Escrow`], keyed by its `u64`
//!   id, since the number of escrows is unbounded and most are read/written only
//!   a handful of times over their lifetime.
//!
//! This contract intentionally does the minimum on-chain: token custody, split
//! payouts, and deadline-based access control. Everything else (worker discovery,
//! local-currency off-ramp via Path Payments, notifications, etc.) lives in the
//! FlashWage frontend, which only ever needs the four calls above plus the two
//! read-only helpers at the bottom of this file.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    String, Vec,
};

/// Keys under which contract state is stored. Kept as a single enum so every
/// storage access in this file goes through one, greppable, type-checked path.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Platform-wide settings, see [`Config`]. Instance storage.
    Config,
    /// Next id to hand out to a new escrow. Instance storage.
    EscrowCount,
    /// A single milestone escrow, see [`Escrow`]. Persistent storage, keyed by id.
    Escrow(u64),
}

/// Platform-wide configuration, set once at [`FlashWageEscrow::initialize`] and
/// read on every escrow operation.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    /// Address allowed to call `initialize` (once) and act as a co-authorizer on
    /// `release_payout`. Typically a multisig in production.
    pub admin: Address,
    /// Token contract addresses (e.g. a USDC Stellar Asset Contract) this escrow
    /// will accept as deposits. Kept explicit rather than "any token" so the
    /// frontend and users can trust that only vetted, liquid assets are lockable.
    pub accepted_assets: Vec<Address>,
    /// Platform fee taken out of every release, expressed in basis points
    /// (1 bps = 0.01%). E.g. `50` = 0.5%.
    pub platform_fee_bps: u32,
    /// Destination address for accumulated platform fees.
    pub fee_vault: Address,
}

/// Lifecycle status of a single [`Escrow`].
#[contracttype]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    /// Funds are locked in the contract, awaiting release or cancellation.
    Active,
    /// Funds have been paid out to the worker (and fee vault).
    Released,
    /// Funds have been refunded to the employer.
    Canceled,
}

/// A single employer → worker milestone payment held in escrow.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Escrow {
    pub id: u64,
    pub employer: Address,
    pub worker: Address,
    /// Token contract address this escrow's `amount` is denominated in.
    pub token: Address,
    /// Amount locked, in the token's smallest unit (e.g. stroops-equivalent).
    pub amount: i128,
    /// Unix timestamp (ledger time) after which auto-release / cancellation unlock.
    pub deadline: u64,
    /// Free-text milestone description shown in the employer/worker dashboards.
    pub description: String,
    pub status: EscrowStatus,
}

/// All error conditions the contract can return. Using `Result<_, Error>` (rather
/// than panicking) keeps failures cheap to simulate and easy for the frontend to
/// surface as friendly messages instead of raw traps.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AssetNotAccepted = 3,
    InvalidAmount = 4,
    InvalidDeadline = 5,
    EscrowNotFound = 6,
    EscrowNotActive = 7,
    Unauthorized = 8,
    DeadlineNotReached = 9,
    FeeTooHigh = 10,
}

// --- Events ------------------------------------------------------------
// Typed contract events, published via `#[contractevent]` (the SDK's
// successor to the raw `env.events().publish(...)` call) so the event shape
// is part of this contract's on-chain interface spec and generated clients
// get typed decoding for free.

/// Emitted when a new milestone escrow is locked.
#[contractevent]
#[derive(Clone, Debug)]
pub struct EscrowCreated {
    #[topic]
    pub escrow_id: u64,
    pub employer: Address,
    pub worker: Address,
    pub token: Address,
    pub amount: i128,
}

/// Emitted when an escrow's funds are paid out to the worker (and fee vault).
#[contractevent]
#[derive(Clone, Debug)]
pub struct EscrowReleased {
    #[topic]
    pub escrow_id: u64,
    pub worker_amount: i128,
    pub platform_fee: i128,
}

/// Emitted when an escrow is canceled and refunded to the employer.
#[contractevent]
#[derive(Clone, Debug)]
pub struct EscrowCanceled {
    #[topic]
    pub escrow_id: u64,
    pub amount: i128,
}

/// Hard ceiling on `platform_fee_bps` (10%), independent of whatever the admin
/// requests at `initialize`. Guards workers against a misconfigured or malicious
/// admin siphoning an unreasonable cut.
const MAX_FEE_BPS: u32 = 1_000;
const BPS_DENOMINATOR: i128 = 10_000;

// --- Storage TTL tuning -----------------------------------------------------
// Soroban charges rent based on how long an entry's "time to live" (TTL) is
// extended for. These constants follow the usual soroban-cli scaffold pattern:
// bump well before expiry (the "threshold") out to a longer horizon (the
// "bump amount"), expressed in ledgers (~5s/ledger on the Stellar network).

/// ~30 days, used for the small, frequently-touched instance storage.
const INSTANCE_BUMP_AMOUNT: u32 = 17280 * 30;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - 17280;
/// ~90 days, used for individual escrow records which may sit untouched for a
/// while between creation and release.
const PERSISTENT_BUMP_AMOUNT: u32 = 17280 * 90;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - 17280;

#[contract]
pub struct FlashWageEscrow;

#[contractimpl]
impl FlashWageEscrow {
    /// One-time platform setup. Must be called before any escrow can be created.
    ///
    /// # Authorization
    /// Requires `admin.require_auth()`.
    ///
    /// # Errors
    /// - [`Error::AlreadyInitialized`] if called more than once.
    /// - [`Error::FeeTooHigh`] if `platform_fee_bps` exceeds [`MAX_FEE_BPS`].
    pub fn initialize(
        env: Env,
        admin: Address,
        accepted_assets: Vec<Address>,
        platform_fee_bps: u32,
        fee_vault: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        if platform_fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }

        admin.require_auth();

        let config = Config {
            admin,
            accepted_assets,
            platform_fee_bps,
            fee_vault,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::EscrowCount, &0u64);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Lock `amount` of `token_address` (pulled from `employer`) into a new
    /// milestone escrow payable to `worker` once released.
    ///
    /// # Authorization
    /// Requires `employer.require_auth()`. The employer must have already
    /// authorized this contract to move `amount` of `token_address` on their
    /// behalf (standard SEP-41 `transfer` semantics — Freighter will prompt for
    /// this as part of signing the transaction).
    ///
    /// # Errors
    /// - [`Error::NotInitialized`] if `initialize` hasn't been called.
    /// - [`Error::AssetNotAccepted`] if `token_address` isn't in `accepted_assets`.
    /// - [`Error::InvalidAmount`] if `amount <= 0`.
    /// - [`Error::InvalidDeadline`] if `deadline` isn't strictly in the future.
    ///
    /// Returns the new escrow's id.
    pub fn create_milestone_escrow(
        env: Env,
        employer: Address,
        worker: Address,
        amount: i128,
        token_address: Address,
        deadline: u64,
        description: String,
    ) -> Result<u64, Error> {
        employer.require_auth();

        let config = Self::read_config(&env)?;

        if !config.accepted_assets.contains(&token_address) {
            return Err(Error::AssetNotAccepted);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }

        // Move funds from the employer's wallet into this contract's custody.
        // `token::Client` speaks the standard SEP-41 token interface, so this
        // works for the native XLM SAC, USDC, or any other Stellar Asset Contract.
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&employer, &env.current_contract_address(), &amount);

        let escrow_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::EscrowCount)
            .unwrap_or(0);

        let escrow = Escrow {
            id: escrow_id,
            employer: employer.clone(),
            worker: worker.clone(),
            token: token_address.clone(),
            amount,
            deadline,
            description,
            status: EscrowStatus::Active,
        };

        let escrow_key = DataKey::Escrow(escrow_id);
        env.storage().persistent().set(&escrow_key, &escrow);
        env.storage().persistent().extend_ttl(
            &escrow_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        env.storage()
            .instance()
            .set(&DataKey::EscrowCount, &(escrow_id + 1));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        EscrowCreated {
            escrow_id,
            employer,
            worker,
            token: token_address,
            amount,
        }
        .publish(&env);

        Ok(escrow_id)
    }

    /// Release an active escrow's funds: `platform_fee_bps` to the fee vault,
    /// the remainder to the worker.
    ///
    /// # Authorization
    /// Requires `caller.require_auth()`, and one of:
    /// - `caller` is the escrow's `employer`, or
    /// - `caller` is the platform `admin`, or
    /// - the escrow's `deadline` has passed — in which case *any* authenticated
    ///   caller may trigger the release. This is the auto-release safety valve:
    ///   a worker (or anyone willing to pay the transaction fee) can always
    ///   force payout once the milestone's deadline has elapsed, so funds can
    ///   never be held hostage by a non-responsive employer.
    ///
    /// # Errors
    /// - [`Error::EscrowNotFound`] if `escrow_id` doesn't exist.
    /// - [`Error::EscrowNotActive`] if it was already released or canceled.
    /// - [`Error::Unauthorized`] if called too early by someone who isn't the
    ///   employer or admin.
    pub fn release_payout(env: Env, caller: Address, escrow_id: u64) -> Result<(), Error> {
        caller.require_auth();

        let config = Self::read_config(&env)?;
        let mut escrow = Self::read_escrow(&env, escrow_id)?;

        if escrow.status != EscrowStatus::Active {
            return Err(Error::EscrowNotActive);
        }

        let past_deadline = env.ledger().timestamp() >= escrow.deadline;
        let is_privileged = caller == escrow.employer || caller == config.admin;
        if !is_privileged && !past_deadline {
            return Err(Error::Unauthorized);
        }

        // Split payout: platform_fee_bps to the vault, remainder to the worker.
        // Integer division rounds the fee down, so the worker never loses a
        // fractional unit to rounding.
        let platform_fee = (escrow.amount * config.platform_fee_bps as i128) / BPS_DENOMINATOR;
        let worker_amount = escrow.amount - platform_fee;

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.worker, &worker_amount);
        if platform_fee > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &config.fee_vault,
                &platform_fee,
            );
        }

        escrow.status = EscrowStatus::Released;
        Self::write_escrow(&env, escrow_id, &escrow);

        EscrowReleased {
            escrow_id,
            worker_amount,
            platform_fee,
        }
        .publish(&env);

        Ok(())
    }

    /// Cancel an active escrow and refund the full `amount` to the employer.
    /// Only possible once the deadline has passed without a release — an
    /// employer can't unilaterally pull funds back while a worker might still
    /// be counting on a timely payout.
    ///
    /// # Authorization
    /// Requires `employer.require_auth()` and `employer` must match the
    /// escrow's stored employer.
    ///
    /// # Errors
    /// - [`Error::EscrowNotFound`] if `escrow_id` doesn't exist.
    /// - [`Error::Unauthorized`] if `employer` doesn't own the escrow.
    /// - [`Error::EscrowNotActive`] if it was already released or canceled.
    /// - [`Error::DeadlineNotReached`] if called before `deadline`.
    pub fn cancel_escrow(env: Env, employer: Address, escrow_id: u64) -> Result<(), Error> {
        employer.require_auth();

        let mut escrow = Self::read_escrow(&env, escrow_id)?;

        if escrow.employer != employer {
            return Err(Error::Unauthorized);
        }
        if escrow.status != EscrowStatus::Active {
            return Err(Error::EscrowNotActive);
        }
        if env.ledger().timestamp() < escrow.deadline {
            return Err(Error::DeadlineNotReached);
        }

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.employer,
            &escrow.amount,
        );

        let refunded_amount = escrow.amount;
        escrow.status = EscrowStatus::Canceled;
        Self::write_escrow(&env, escrow_id, &escrow);

        EscrowCanceled {
            escrow_id,
            amount: refunded_amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Read-only: fetch a single escrow by id. Used by both dashboards to render
    /// milestone status without needing a full transaction.
    pub fn get_escrow(env: Env, escrow_id: u64) -> Result<Escrow, Error> {
        Self::read_escrow(&env, escrow_id)
    }

    /// Read-only: fetch the platform configuration (admin, accepted assets, fee).
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::read_config(&env)
    }
}

// --- internal helpers -------------------------------------------------------
// Deliberately in a plain `impl` block *without* `#[contractimpl]`: that macro
// turns every function in its block into a public contract entry point, so any
// shared plumbing (storage read/write helpers) has to live outside of it or it
// would leak onto the contract's on-chain ABI.
impl FlashWageEscrow {
    fn read_config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn read_escrow(env: &Env, escrow_id: u64) -> Result<Escrow, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .ok_or(Error::EscrowNotFound)
    }

    fn write_escrow(env: &Env, escrow_id: u64, escrow: &Escrow) {
        let key = DataKey::Escrow(escrow_id);
        env.storage().persistent().set(&key, escrow);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
    }
}

#[cfg(test)]
mod test;
