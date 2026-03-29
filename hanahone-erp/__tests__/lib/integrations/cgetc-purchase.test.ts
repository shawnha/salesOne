// __tests__/lib/integrations/cgetc-purchase.test.ts
import { describe, it, expect } from "vitest";
import { parseSkuFromProductName } from "@/lib/integrations/connectors/cgetc-purchase";

describe("cgetc-purchase", () => {
  describe("parseSkuFromProductName", () => {
    it("extracts SKU from brackets", () => {
      expect(parseSkuFromProductName("[8800316050001] ODD M-01 Starter-kit")).toBe("8800316050001");
    });

    it("extracts SKU with alphanumeric", () => {
      expect(parseSkuFromProductName("[XG-MNLD-D8SM] ODD M-01 30day Refill-pack")).toBe("XG-MNLD-D8SM");
    });

    it("returns null when no brackets", () => {
      expect(parseSkuFromProductName("Product without SKU")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseSkuFromProductName("")).toBeNull();
    });
  });
});
