import { describe, expect, it } from "vitest";
import {
  datetimeLocalToUnixSeconds,
  formatDeadline,
  formatTokenAmount,
  formatUsd,
  isPastDeadline,
  parseTokenAmount,
  truncateAddress,
} from "./format";

// These are the sharpest edges in the frontend: every amount that moves
// between the UI and the contract passes through bigint<->decimal-string
// conversion here. A rounding or truncation bug in either direction either
// shows a worker the wrong payout or sends the wrong amount on-chain.

describe("truncateAddress", () => {
  it("leaves short strings untouched", () => {
    expect(truncateAddress("short")).toBe("short");
  });

  it("truncates a real Stellar address to lead…trail", () => {
    const address = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX";
    expect(truncateAddress(address)).toBe("GABC…UVWX");
  });
});

describe("formatTokenAmount", () => {
  it("formats a whole number with no fractional part", () => {
    expect(formatTokenAmount(10_000_000n)).toBe("1");
  });

  it("formats zero", () => {
    expect(formatTokenAmount(0n)).toBe("0");
  });

  it("strips trailing zeros from the fractional part", () => {
    expect(formatTokenAmount(15_500_000n)).toBe("1.55");
  });

  it("keeps full precision when there are no trailing zeros", () => {
    expect(formatTokenAmount(12_345_678n)).toBe("1.2345678");
  });

  it("adds thousands separators to the whole part", () => {
    expect(formatTokenAmount(100_000_000_000n)).toBe("10,000");
  });

  it("renders negative amounts with a leading minus", () => {
    expect(formatTokenAmount(-15_500_000n)).toBe("-1.55");
  });
});

describe("parseTokenAmount", () => {
  it("parses a plain integer", () => {
    expect(parseTokenAmount("5")).toBe(50_000_000n);
  });

  it("parses a decimal amount", () => {
    expect(parseTokenAmount("125.50")).toBe(1_255_000_000n);
  });

  it("parses a leading-dot amount", () => {
    expect(parseTokenAmount(".5")).toBe(5_000_000n);
  });

  it("parses a trailing-dot amount", () => {
    expect(parseTokenAmount("5.")).toBe(50_000_000n);
  });

  it("round-trips through formatTokenAmount", () => {
    const parsed = parseTokenAmount("42.1234567");
    expect(formatTokenAmount(parsed)).toBe("42.1234567");
  });

  it("rejects non-numeric input", () => {
    expect(() => parseTokenAmount("abc")).toThrow();
  });

  it("rejects a negative amount (no minus sign accepted)", () => {
    expect(() => parseTokenAmount("-5")).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => parseTokenAmount("")).toThrow();
  });

  it("rejects more decimal places than the token supports", () => {
    expect(() => parseTokenAmount("1.12345678")).toThrow();
  });

  it("accepts exactly the token's decimal precision", () => {
    expect(() => parseTokenAmount("1.1234567")).not.toThrow();
  });
});

describe("formatUsd", () => {
  it("prefixes the formatted amount with a dollar sign", () => {
    expect(formatUsd(10_000_000n)).toBe("$1");
  });
});

describe("formatDeadline", () => {
  it("returns a non-empty, locale-formatted string without throwing", () => {
    const result = formatDeadline(BigInt(Math.floor(Date.now() / 1000)));
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("isPastDeadline", () => {
  it("is true for a timestamp far in the past", () => {
    expect(isPastDeadline(1n)).toBe(true);
  });

  it("is false for a timestamp far in the future", () => {
    const farFuture = BigInt(Math.floor(Date.now() / 1000)) + 10_000_000n;
    expect(isPastDeadline(farFuture)).toBe(false);
  });
});

describe("datetimeLocalToUnixSeconds", () => {
  it("parses a datetime-local value into Unix seconds", () => {
    const seconds = datetimeLocalToUnixSeconds("2030-01-01T00:00");
    // Just confirm it's a plausible future timestamp, not exact-matching a
    // specific timezone offset.
    expect(seconds).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
  });

  it("rejects an unparseable string", () => {
    expect(() => datetimeLocalToUnixSeconds("not-a-date")).toThrow();
  });
});
