//! Unit tests for the FlashWage escrow contract.
//!
//! These run natively (not in WASM) against the Soroban test host, using
//! `env.mock_all_auths()` where we don't care about testing auth itself, and
//! explicit, unmocked auth where a test's whole point *is* to verify who can
//! and can't call something.

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::StellarAssetClient,
    token::TokenClient,
    Env, String,
};

/// Deploys a Stellar Asset Contract instance for use as a test token, returning
/// its address plus SEP-41 (`TokenClient`) and asset-admin (`StellarAssetClient`)
/// clients for it.
fn create_token<'a>(env: &Env, admin: &Address) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let address = sac.address();
    (
        address.clone(),
        TokenClient::new(env, &address),
        StellarAssetClient::new(env, &address),
    )
}

/// Common test fixture: a registered escrow contract, an initialized platform
/// config, a funded employer, and an accepted test token.
struct Fixture<'a> {
    env: Env,
    contract: FlashWageEscrowClient<'a>,
    admin: Address,
    fee_vault: Address,
    employer: Address,
    worker: Address,
    token: TokenClient<'a>,
    token_address: Address,
}

fn setup(fee_bps: u32) -> Fixture<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let admin = Address::generate(&env);
    let fee_vault = Address::generate(&env);
    let employer = Address::generate(&env);
    let worker = Address::generate(&env);

    let (token_address, token, token_admin) = create_token(&env, &admin);
    token_admin.mint(&employer, &1_000_000);

    let contract_id = env.register(FlashWageEscrow, ());
    let contract = FlashWageEscrowClient::new(&env, &contract_id);

    let mut accepted = Vec::new(&env);
    accepted.push_back(token_address.clone());
    contract.initialize(&admin, &accepted, &fee_bps, &fee_vault);

    Fixture {
        env,
        contract,
        admin,
        fee_vault,
        employer,
        worker,
        token,
        token_address,
    }
}

fn milestone_desc(env: &Env) -> String {
    String::from_str(env, "Ship v1 of the landing page")
}

#[test]
fn initialize_sets_config() {
    let f = setup(50);
    let config = f.contract.get_config();
    assert_eq!(config.admin, f.admin);
    assert_eq!(config.fee_vault, f.fee_vault);
    assert_eq!(config.platform_fee_bps, 50);
    assert!(config.accepted_assets.contains(&f.token_address));
}

#[test]
fn initialize_twice_fails() {
    let f = setup(50);
    let result = f
        .contract
        .try_initialize(&f.admin, &Vec::new(&f.env), &50, &f.fee_vault);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn initialize_rejects_excessive_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let fee_vault = Address::generate(&env);
    let contract_id = env.register(FlashWageEscrow, ());
    let contract = FlashWageEscrowClient::new(&env, &contract_id);

    let result = contract.try_initialize(&admin, &Vec::new(&env), &1_001, &fee_vault);
    assert_eq!(result, Err(Ok(Error::FeeTooHigh)));
}

#[test]
fn create_escrow_locks_funds() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);

    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    assert_eq!(escrow_id, 0);
    assert_eq!(f.token.balance(&f.employer), 990_000);
    assert_eq!(f.token.balance(&f.contract.address), 10_000);

    let escrow = f.contract.get_escrow(&escrow_id);
    assert_eq!(escrow.amount, 10_000);
    assert_eq!(escrow.worker, f.worker);
    assert_eq!(escrow.status, EscrowStatus::Active);
}

#[test]
fn create_escrow_rejects_unaccepted_asset() {
    let f = setup(50);
    let (other_token, _client, other_admin) = create_token(&f.env, &f.admin);
    other_admin.mint(&f.employer, &1_000);
    let desc = milestone_desc(&f.env);

    let result = f.contract.try_create_milestone_escrow(
        &f.employer,
        &f.worker,
        &1_000,
        &other_token,
        &2_000,
        &desc,
    );
    assert_eq!(result, Err(Ok(Error::AssetNotAccepted)));
}

#[test]
fn create_escrow_rejects_invalid_amount_and_deadline() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);

    let bad_amount = f.contract.try_create_milestone_escrow(
        &f.employer,
        &f.worker,
        &0,
        &f.token_address,
        &2_000,
        &desc,
    );
    assert_eq!(bad_amount, Err(Ok(Error::InvalidAmount)));

    let bad_deadline = f.contract.try_create_milestone_escrow(
        &f.employer,
        &f.worker,
        &1_000,
        &f.token_address,
        &500, // before current ledger timestamp (1_000)
        &desc,
    );
    assert_eq!(bad_deadline, Err(Ok(Error::InvalidDeadline)));
}

#[test]
fn release_by_employer_splits_fee_correctly() {
    let f = setup(50); // 0.5%
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &100_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    f.contract.release_payout(&f.employer, &escrow_id);

    // 0.5% of 100_000 = 500 to the vault, 99_500 to the worker.
    assert_eq!(f.token.balance(&f.worker), 99_500);
    assert_eq!(f.token.balance(&f.fee_vault), 500);
    assert_eq!(f.token.balance(&f.contract.address), 0);

    let escrow = f.contract.get_escrow(&escrow_id);
    assert_eq!(escrow.status, EscrowStatus::Released);
}

#[test]
fn release_by_admin_is_allowed() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    f.contract.release_payout(&f.admin, &escrow_id);
    assert_eq!(f.contract.get_escrow(&escrow_id).status, EscrowStatus::Released);
}

#[test]
fn release_before_deadline_by_stranger_fails() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    let stranger = Address::generate(&f.env);
    let result = f.contract.try_release_payout(&stranger, &escrow_id);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn auto_release_after_deadline_by_anyone() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    // Fast-forward past the deadline; even a random address (here, the worker)
    // can now force the release without being the employer or admin.
    f.env.ledger().with_mut(|li| li.timestamp = 2_001);
    f.contract.release_payout(&f.worker, &escrow_id);

    assert_eq!(f.contract.get_escrow(&escrow_id).status, EscrowStatus::Released);
    assert!(f.token.balance(&f.worker) > 0);
}

#[test]
fn double_release_fails() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    f.contract.release_payout(&f.employer, &escrow_id);
    let result = f.contract.try_release_payout(&f.employer, &escrow_id);
    assert_eq!(result, Err(Ok(Error::EscrowNotActive)));
}

#[test]
fn cancel_before_deadline_fails() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    let result = f.contract.try_cancel_escrow(&f.employer, &escrow_id);
    assert_eq!(result, Err(Ok(Error::DeadlineNotReached)));
}

#[test]
fn cancel_after_deadline_refunds_employer() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    let balance_after_lock = f.token.balance(&f.employer);
    f.env.ledger().with_mut(|li| li.timestamp = 2_001);
    f.contract.cancel_escrow(&f.employer, &escrow_id);

    assert_eq!(f.token.balance(&f.employer), balance_after_lock + 10_000);
    assert_eq!(f.contract.get_escrow(&escrow_id).status, EscrowStatus::Canceled);
}

#[test]
fn cancel_by_non_employer_fails() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    let escrow_id = f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );

    f.env.ledger().with_mut(|li| li.timestamp = 2_001);
    let result = f.contract.try_cancel_escrow(&f.worker, &escrow_id);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn get_escrow_missing_id_fails() {
    let f = setup(50);
    let result = f.contract.try_get_escrow(&999);
    assert_eq!(result, Err(Ok(Error::EscrowNotFound)));
}

#[test]
fn get_escrow_count_tracks_creations() {
    let f = setup(50);
    let desc = milestone_desc(&f.env);
    assert_eq!(f.contract.get_escrow_count(), 0);

    f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &10_000,
        &f.token_address,
        &2_000,
        &desc,
    );
    assert_eq!(f.contract.get_escrow_count(), 1);

    f.contract.create_milestone_escrow(
        &f.employer,
        &f.worker,
        &5_000,
        &f.token_address,
        &2_000,
        &desc,
    );
    assert_eq!(f.contract.get_escrow_count(), 2);
}
