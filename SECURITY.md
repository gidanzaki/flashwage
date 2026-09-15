# Security

FlashWage's escrow contract moves real funds, so it gets held to a higher bar than the frontend — see [CONTRIBUTING.md](CONTRIBUTING.md#review-process). This file tracks what's actually been reviewed, not just what's aspired to.

## Reporting a vulnerability

Please don't open a public issue for a suspected vulnerability. Email the address in the repo owner's GitHub profile, or open a [private security advisory](../../security/advisories/new) on this repo. We'll acknowledge within a few days.

## Status

No external audit has been done. This is a pre-revenue, early-stage project — an audit is the right next step once there's a production deployment worth paying to have audited, not before. In the meantime, here's what internal review has covered.

## Self-review log

### 2026-09-15 — checks-effects-interactions ordering

**Finding:** `release_payout` and `cancel_escrow` both called the token contract's `transfer` *before* writing the escrow's new status (`Released`/`Canceled`) to storage. That's the classic checks-effects-interactions violation: if a token's `transfer` implementation ever called back into this contract before returning, a second `release_payout`/`cancel_escrow` call on the same escrow would still see `status == Active` and could pay out twice.

**Why it wasn't (yet) exploitable:** `accepted_assets` is admin-curated, and Stellar Asset Contracts — the only token type this project currently intends to accept — have no callback hooks, so there's no code path for a `transfer` call to reenter this contract today.

**Why it was fixed anyway:** that safety depends entirely on an admin never whitelisting a token that *does* have hooks (a compromised admin key, or just a bad judgment call, are both realistic threats over a project's lifetime), not on anything the contract itself enforces. Fixed by writing the new status before making any external transfer call, in both functions. See `contracts/flashwage_escrow/src/lib.rs`.

**Verification:** all 17 existing unit tests still pass unchanged after the reorder (it's behavior-preserving for every currently-tested path); no dedicated reentrancy exploit test was added, since simulating one requires a second mock-malicious-token contract, which is a fair next scoped issue for a contributor rather than something folded in here.

### 2026-09-15 — unbounded `accepted_assets`

**Finding:** `initialize` placed no upper bound on how many token addresses `accepted_assets` could contain. `Config` — including the full list — is read on every `create_milestone_escrow`, `release_payout`, and `cancel_escrow` call, so an unbounded list makes every future call progressively more expensive to simulate and execute.

**Why it's low severity:** only the admin can call `initialize`, and only once — this isn't attacker-reachable, just a self-inflicted footgun.

**Fix:** capped at 20 (`MAX_ACCEPTED_ASSETS`), returning the new `Error::TooManyAcceptedAssets` if exceeded. Same pattern as the existing `MAX_FEE_BPS` cap on `platform_fee_bps`.

## Known accepted risks (by design, not oversights)

- **Anyone can trigger `release_payout` once an escrow's deadline has passed.** This is intentional — see the contract's own doc comments — so a worker's payout can never be held hostage by an unresponsive employer. The payout destination is fixed at escrow-creation time regardless of who calls it, so this can't be used to redirect funds.
- **No on-chain admin multisig or timelock yet.** A single `admin` key can call `initialize` (once) and act as a co-authorizer on releases. Hardening this (multisig, or a timelock on admin actions) is tracked as milestone M6 in `CONTRIBUTING.md`.
- **Worker discovery is a client-side `0..get_escrow_count()` scan**, not a security issue but a scale limitation — tracked as M8.
