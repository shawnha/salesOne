import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateCronSecret } from "@/app/api/cron/cgetc-sync/route";

describe("CGETC Cron Sync", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-secret-123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("validateCronSecret", () => {
    it("returns false when no authorization header", () => {
      expect(validateCronSecret(null)).toBe(false);
    });

    it("returns false when secret does not match", () => {
      expect(validateCronSecret("Bearer wrong-secret")).toBe(false);
    });

    it("returns true when secret matches", () => {
      expect(validateCronSecret("Bearer test-secret-123")).toBe(true);
    });

    it("returns false when CRON_SECRET env is not set", () => {
      delete process.env.CRON_SECRET;
      expect(validateCronSecret("Bearer test-secret-123")).toBe(false);
    });
  });
});
