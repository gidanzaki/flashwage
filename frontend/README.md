# FlashWage frontend

Next.js (App Router) app for the FlashWage employer dashboard and worker payout portal. Full setup instructions, required env vars, and what's actually been verified so far live in the [root README](../README.md#frontend) — this file is just a map of where things are.

```
src/
├── app/
│   ├── page.tsx           # landing page: hero + live TVL/disbursement banner
│   ├── employer/page.tsx  # create escrows, release/cancel
│   └── worker/page.tsx    # view assigned milestones, claim, withdraw
├── components/            # WalletButton, EscrowCard, CreateEscrowForm, WithdrawFlow, ...
└── lib/
    ├── wallet.ts           # thin wrapper around @stellar/freighter-api
    ├── contract.ts         # typed client for the escrow contract's 6 methods
    ├── pathPayment.ts       # classic-layer Path Payment for worker withdrawals
    ├── constants.ts         # network/contract config, sourced from env vars
    ├── format.ts             # amount/address/date formatting helpers
    └── types.ts               # Escrow/Config shapes mirroring the Rust contract
```

Quick start:

```bash
npm install
cp .env.local.example .env.local   # fill in a deployed contract ID, see root README
npm run dev
```
