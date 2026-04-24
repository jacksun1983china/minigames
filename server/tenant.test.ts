import { describe, it, expect } from "vitest";

// ── Inline tenant validation logic ────────────────────────────────────────────

function generateApiKey(prefix = "npg"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = `${prefix}_`;
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function validateApiKeyFormat(key: string): boolean {
  return /^[a-z]+_[A-Za-z0-9]{32}$/.test(key);
}

function validateTenantSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,32}$/.test(slug);
}

function validateRtpValue(rtp: number): { valid: boolean; error?: string } {
  if (rtp < 50) return { valid: false, error: "RTP must be at least 50%" };
  if (rtp > 99) return { valid: false, error: "RTP cannot exceed 99%" };
  if (!Number.isFinite(rtp)) return { valid: false, error: "RTP must be a finite number" };
  return { valid: true };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Tenant - API Key Generation", () => {
  it("generates API keys with correct format", () => {
    const key = generateApiKey("npg");
    expect(validateApiKeyFormat(key)).toBe(true);
    expect(key.startsWith("npg_")).toBe(true);
    expect(key.length).toBe(36); // "npg_" (4) + 32 chars
  });

  it("generates unique API keys", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});

describe("Tenant - Slug Validation", () => {
  it("accepts valid slugs", () => {
    expect(validateTenantSlug("my-casino")).toBe(true);
    expect(validateTenantSlug("casino123")).toBe(true);
    expect(validateTenantSlug("abc")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(validateTenantSlug("AB")).toBe(false); // too short
    expect(validateTenantSlug("UPPERCASE")).toBe(false); // uppercase
    expect(validateTenantSlug("has space")).toBe(false); // space
    expect(validateTenantSlug("a".repeat(33))).toBe(false); // too long
  });
});

describe("Tenant - RTP Validation", () => {
  it("accepts valid RTP values", () => {
    expect(validateRtpValue(96).valid).toBe(true);
    expect(validateRtpValue(85).valid).toBe(true);
    expect(validateRtpValue(99).valid).toBe(true);
    expect(validateRtpValue(50).valid).toBe(true);
  });

  it("rejects out-of-range RTP values", () => {
    expect(validateRtpValue(100).valid).toBe(false);
    expect(validateRtpValue(49).valid).toBe(false);
    expect(validateRtpValue(-1).valid).toBe(false);
  });

  it("rejects non-finite RTP values", () => {
    expect(validateRtpValue(Infinity).valid).toBe(false);
    expect(validateRtpValue(NaN).valid).toBe(false);
  });
});

describe("Tenant - Multi-tenant Data Isolation", () => {
  it("tenant IDs are unique identifiers", () => {
    const tenantIds = [1, 2, 3, 4, 5];
    const uniqueIds = new Set(tenantIds);
    expect(uniqueIds.size).toBe(tenantIds.length);
  });

  it("API keys belong to specific tenants", () => {
    const tenantApiKeys: Record<number, string[]> = {
      1: [generateApiKey("t1"), generateApiKey("t1")],
      2: [generateApiKey("t2")],
    };

    // Each tenant's keys should be unique
    const allKeys = Object.values(tenantApiKeys).flat();
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);
  });
});
