import { TOKEN_DECIMALS } from "./constants";

/** "GABC...WXYZ" — short enough for a table cell, still visually distinct. */
export function truncateAddress(address: string, lead = 4, trail = 4): string {
  if (address.length <= lead + trail + 3) return address;
  return `${address.slice(0, lead)}…${address.slice(-trail)}`;
}

/** Converts a smallest-unit bigint amount into a human decimal string. */
export function formatTokenAmount(amount: bigint, decimals = TOKEN_DECIMALS): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = abs % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  const sign = negative ? "-" : "";
  return fractionStr ? `${sign}${wholeStr}.${fractionStr}` : `${sign}${wholeStr}`;
}

/** Parses a user-typed decimal string ("125.5") into a smallest-unit bigint. */
export function parseTokenAmount(input: string, decimals = TOKEN_DECIMALS): bigint {
  const trimmed = input.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) {
    throw new Error("Enter a valid amount, e.g. 125.50");
  }
  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(`Amount can have at most ${decimals} decimal places.`);
  }
  const wholeDigits = wholePart || "0";
  const fractionDigits = fractionPart.padEnd(decimals, "0");
  return BigInt(wholeDigits) * 10n ** BigInt(decimals) + BigInt(fractionDigits || "0");
}

export function formatUsd(amount: bigint, decimals = TOKEN_DECIMALS): string {
  return `$${formatTokenAmount(amount, decimals)}`;
}

/** Local (browser) date/time for a Unix-seconds deadline. */
export function formatDeadline(deadlineSeconds: bigint): string {
  const date = new Date(Number(deadlineSeconds) * 1000);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function isPastDeadline(deadlineSeconds: bigint): boolean {
  return BigInt(Math.floor(Date.now() / 1000)) >= deadlineSeconds;
}

/** `<input type="datetime-local">` value → Unix seconds. */
export function datetimeLocalToUnixSeconds(value: string): bigint {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) throw new Error("Enter a valid date and time.");
  return BigInt(Math.floor(ms / 1000));
}
