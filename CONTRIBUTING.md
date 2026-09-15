# Contributing to FlashWage

Thanks for taking a look at this. FlashWage is early — right now it's one working Soroban contract and a lot of open surface area — which means there's real design work left, not just typo fixes. If you're coming from Drips, the Stellar Community Fund, GrantFox, or Gitcoin looking for a milestone to claim, skip to [Milestones for grant/bounty contributors](#milestones-for-grantbounty-contributors) below.

## Before you write code

For anything bigger than a small fix, open an issue first (or comment on an existing one) describing what you want to do. This isn't bureaucracy for its own sake — it's so you don't spend a weekend building the worker dashboard only to find someone else already has a PR open for it, or that the maintainers wanted it built differently. For typo fixes and small, obviously-correct changes, just open the PR.

## Setting up

Follow the "Getting the contract running locally" section in [README.md](README.md). If something in those steps doesn't work on your machine, that's worth an issue in itself — it means the docs are wrong for someone.

## Code style

### Rust (`contracts/`)

- Run `cargo fmt` before committing. No exceptions, no bikeshedding about style — let the formatter decide.
- Run `cargo clippy --all-targets` and actually look at what it says. It's fine to `#[allow(...)]` something with a comment explaining why, but silent warnings don't get merged.
- Every public contract function needs a doc comment covering what it does, who's authorized to call it, and what errors it can return. Look at the existing functions in `lib.rs` for the pattern — the goal is that someone reading the contract's public interface never has to open the implementation to understand the contract.
- New behavior needs a test. If you're touching auth logic or the deadline-gated paths, add both a "this is allowed" and a "this is correctly rejected" test — see `src/test.rs` for the existing pattern of pairing happy-path and unauthorized-caller tests.
- Prefer returning `Result<_, Error>` over panicking. Panics are for genuinely unreachable states, not expected failure conditions like "escrow not found" — those should be typed errors the frontend can catch and show a real message for.

### TypeScript / frontend (once it exists)

- Prettier + ESLint, default configs unless there's a specific reason to deviate (and if there is, put it in `.eslintrc` with a comment, not tribal knowledge).
- Components stay small and composable — if a component's doing wallet connection *and* form validation *and* rendering a list, it's doing too much.
- No inline magic numbers for anything Stellar-related (asset decimals, bps math, etc.) — pull them into a constants file so there's one place to fix if Soroban's conventions change.

## Commits and PRs

- Branch names: `feat/worker-payout-portal`, `fix/escrow-ttl-bug`, `docs/deploy-guide` — prefix tells you what kind of change it is at a glance.
- Keep PRs scoped to one thing. A PR that adds the worker portal *and* refactors the wallet connection helper *and* fixes an unrelated typo is three PRs wearing a trenchcoat — it's harder to review and harder to revert if one part turns out to be wrong.
- Write the PR description like you're explaining it to someone who wasn't in your head while you wrote it: what changed, why, and how you tested it. "Fixes bug" is not a description.
- Link the issue you're closing, if there is one.
- If your change touches the contract, paste the `cargo test` output (or just confirm all tests pass) in the PR — this gets checked either way, but it saves a round trip.

## Review process

Someone will look at it, probably ask questions or request changes — that's normal and not a judgment on the idea, just how it goes for anything touching money-moving code. Contract changes get held to a higher bar than frontend changes, because a bug in `release_payout` costs someone real funds in a way a CSS bug doesn't. Expect more scrutiny there, not less.

## Milestones for grant/bounty contributors

These map roughly to the roadmap in the README, sized so a reviewer (or you) can judge scope before committing to one. "Size" is a rough guess at effort, not a hard estimate.

| Milestone | Scope | Size | Status |
|---|---|---|---|
| M1 — Escrow contract | Lock/release/cancel logic, deadline auto-release, fee split, full test coverage | M | ✅ Done |
| M2 — Employer dashboard | Freighter connect, create-escrow form, active escrows list with a release trigger | M | ✅ Built — see caveat below |
| M3 — Worker payout portal | View pending/completed milestones by wallet address, withdraw via a Path Payment into a local stablecoin | M | ✅ Built — see caveat below |
| M4 — Analytics banner | TVL, total disbursements, average settlement time — reading from contract state, not hardcoded | S | ✅ Built — see caveat below |
| M7 — First live verification | Deploy the contract to testnet, wire up `.env.local`, and exercise every contract call end-to-end. Done via `stellar contract invoke` and by calling `lib/contract.ts`'s own functions directly against the live RPC — caught and fixed a real Result-unwrapping bug (see README "Live on testnet") and two unrelated dependency vulnerabilities (one critical) in the process | M | ✅ Done |
| M12 — Browser click-through | Everything in M7 called the same underlying functions directly; nobody has clicked the UI's own buttons with the Freighter extension installed yet. **Good place to start** if you want the shortest path to a real contribution | S | **Open — good place to start** |
| M5 — Passkey wallet support | Stellar passkey template alongside Freighter, so users without a browser extension can still sign | M | Open |
| M6 — Admin key hardening | Multi-sig or timelock in front of the admin role, contract upgrade path | L | Open |
| M8 — Indexed escrow lookup | Replace the client-side `0..get_escrow_count()` scan in `lib/contract.ts` with real event-based (or backend-indexed) lookup | M | Open |
| M9 — CI | GitHub Actions running contract fmt/clippy/test/build and frontend lint/test/build on every push/PR | S | ✅ Done |
| M10 — Frontend test coverage | Vitest suite for the bigint/decimal formatting and ScVal-decoding logic | S | ✅ Done |
| M11 — Reentrancy regression test | A mock token contract whose `transfer` calls back into `release_payout`/`cancel_escrow`, proving the checks-effects-interactions fix (see [SECURITY.md](SECURITY.md)) actually holds rather than just reasoning about it | M | Open |

**Caveat on M2–M4:** the code they call (`lib/contract.ts`'s reads and writes) has been verified against a live testnet deployment — see the README's "Live on testnet" — but that was done by calling those functions directly, not by clicking the actual UI with Freighter installed. That last gap is M12. If you pick that up and find something in the M2–M4 components that doesn't actually work end-to-end, fixing it *is* the contribution; open a PR rather than a bug report if you're already there.

Good first issues (once filed) will be tagged `good-first-issue` — those are intentionally scoped to be doable without a deep-dive into the whole codebase first.

## Questions

Open a GitHub Discussion or an issue tagged `question`. If you're stuck on something Soroban-specific rather than FlashWage-specific, the Stellar Developer Discord (linked from [stellar.org](https://stellar.org)) is usually faster than waiting on a maintainer here.

## Code of conduct

Be someone people want to collaborate with. Disagree about the code, not about each other. If someone's being a jerk, tell a maintainer.
