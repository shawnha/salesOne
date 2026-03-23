import { describe, it, expect } from "vitest";
import { buildCompanyFilter } from "@/lib/company-filter";

describe("buildCompanyFilter", () => {
  it("returns empty where for group view (null)", () => {
    expect(buildCompanyFilter(null)).toEqual({});
  });
  it("returns companyId filter for specific company", () => {
    expect(buildCompanyFilter("abc-123")).toEqual({ companyId: "abc-123" });
  });
});
