import { describe, expect, it } from "vitest";
import { fromRawConfig, fromRawEscrow } from "./contract";

// These two functions are the one place the frontend interprets exactly how
// @stellar/stellar-sdk decodes the Soroban contract's ScVal wire format into
// JS values. Getting the `EscrowStatus` decoding wrong (it comes back as
// `{ tag: "Active" }`, not the string directly — confirmed against the
// soroban-sdk-macros source, since `#[contracttype]` enums without explicit
// discriminants compile to a "union", not a C-like enum) would silently
// break every status badge and filter in the UI without a type error to
// catch it, since both are plain strings/objects — hence a test here rather
// than trusting the types alone.

describe("fromRawEscrow", () => {
  it("unwraps the status tag and carries every field through unchanged", () => {
    const escrow = fromRawEscrow({
      id: 7n,
      employer: "GEMPLOYER",
      worker: "GWORKER",
      token: "CTOKEN",
      amount: 1_255_000_000n,
      deadline: 1_893_456_000n,
      description: "Ship v1 of the landing page",
      status: { tag: "Active" },
    });

    expect(escrow).toEqual({
      id: 7n,
      employer: "GEMPLOYER",
      worker: "GWORKER",
      token: "CTOKEN",
      amount: 1_255_000_000n,
      deadline: 1_893_456_000n,
      description: "Ship v1 of the landing page",
      status: "Active",
    });
  });

  it.each(["Active", "Released", "Canceled"] as const)(
    "decodes the %s status tag",
    (tag) => {
      const escrow = fromRawEscrow({
        id: 0n,
        employer: "G1",
        worker: "G2",
        token: "C1",
        amount: 0n,
        deadline: 0n,
        description: "",
        status: { tag },
      });
      expect(escrow.status).toBe(tag);
    }
  );
});

describe("fromRawConfig", () => {
  it("converts the contract's snake_case fields to the frontend's camelCase shape", () => {
    const config = fromRawConfig({
      admin: "GADMIN",
      accepted_assets: ["CTOKEN1", "CTOKEN2"],
      platform_fee_bps: 50,
      fee_vault: "GVAULT",
    });

    expect(config).toEqual({
      admin: "GADMIN",
      acceptedAssets: ["CTOKEN1", "CTOKEN2"],
      platformFeeBps: 50,
      feeVault: "GVAULT",
    });
  });

  it("preserves an empty accepted-assets list rather than defaulting it away", () => {
    const config = fromRawConfig({
      admin: "GADMIN",
      accepted_assets: [],
      platform_fee_bps: 0,
      fee_vault: "GVAULT",
    });
    expect(config.acceptedAssets).toEqual([]);
  });
});
