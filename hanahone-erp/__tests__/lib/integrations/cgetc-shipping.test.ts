import { describe, it, expect } from "vitest";
import { parseInvoiceRow } from "@/lib/integrations/connectors/cgetc-shipping";

describe("cgetc-shipping", () => {
  describe("parseInvoiceRow", () => {
    it("parses SO number, date, and amount from table cells", () => {
      const cells = ["SO1414438", "", "07/29/2025", "", "$ 10.78"];
      const result = parseInvoiceRow(cells);
      expect(result).toEqual({ soNumber: "SO1414438", date: "2025-07-29", amount: 10.78 });
    });

    it("returns null for invalid row", () => {
      expect(parseInvoiceRow(["", "", "", ""])).toBeNull();
    });

    it("handles amounts without spaces", () => {
      const cells = ["SO12345", "", "01/15/2026", "", "$27.26"];
      const result = parseInvoiceRow(cells);
      expect(result?.amount).toBe(27.26);
    });
  });
});
