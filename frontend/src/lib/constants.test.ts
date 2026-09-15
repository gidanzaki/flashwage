import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// constants.ts reads NEXT_PUBLIC_* env vars at module-load time, so each
// case here stubs the env, resets the module cache, and re-imports fresh —
// the only way to actually exercise different configurations rather than
// whatever happened to be set when the test file first loaded.

const ENV_KEYS = [
  "NEXT_PUBLIC_ARS_ISSUER",
  "NEXT_PUBLIC_BRL_ISSUER",
  "NEXT_PUBLIC_EURC_ISSUER",
] as const;

describe("LOCAL_CURRENCIES", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) vi.stubEnv(key, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("excludes every currency when no issuers are configured", async () => {
    const { LOCAL_CURRENCIES } = await import("./constants");
    expect(LOCAL_CURRENCIES).toEqual([]);
  });

  it("includes only currencies with a configured issuer", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARS_ISSUER", "GARSISSUER");
    vi.resetModules();
    const { LOCAL_CURRENCIES } = await import("./constants");

    expect(LOCAL_CURRENCIES).toHaveLength(1);
    expect(LOCAL_CURRENCIES[0]).toMatchObject({ code: "ARS", issuer: "GARSISSUER" });
  });

  it("includes all three when all three issuers are configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARS_ISSUER", "GARSISSUER");
    vi.stubEnv("NEXT_PUBLIC_BRL_ISSUER", "GBRLISSUER");
    vi.stubEnv("NEXT_PUBLIC_EURC_ISSUER", "GEURCISSUER");
    vi.resetModules();
    const { LOCAL_CURRENCIES } = await import("./constants");

    expect(LOCAL_CURRENCIES.map((c) => c.code).sort()).toEqual(["ARS", "BRL", "EURC"]);
  });
});
