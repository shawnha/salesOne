import { describe, it, expect } from "vitest";
import { canAccessCompany, getAccessibleCompanyIds } from "@/lib/auth-utils";

describe("canAccessCompany", () => {
  it("ADMIN can access any company", () => {
    expect(canAccessCompany("ADMIN", "hoi-id", "hok-id")).toBe(true);
  });
  it("MANAGER can only access own company", () => {
    expect(canAccessCompany("MANAGER", "hoi-id", "hoi-id")).toBe(true);
    expect(canAccessCompany("MANAGER", "hoi-id", "hok-id")).toBe(false);
  });
  it("STAFF can only access own company", () => {
    expect(canAccessCompany("STAFF", "hoi-id", "hoi-id")).toBe(true);
    expect(canAccessCompany("STAFF", "hoi-id", "hok-id")).toBe(false);
  });
  it("ADMIN can access group view (null companyId)", () => {
    expect(canAccessCompany("ADMIN", "hoi-id", null)).toBe(true);
  });
  it("non-ADMIN cannot access group view", () => {
    expect(canAccessCompany("MANAGER", "hoi-id", null)).toBe(false);
  });
});
