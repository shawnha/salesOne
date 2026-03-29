import { describe, it, expect } from "vitest";
import { mapPartnerToContact } from "@/lib/integrations/connectors/cgetc-partners";

describe("cgetc-partners", () => {
  describe("mapPartnerToContact", () => {
    it("maps Odoo partner fields to contact info", () => {
      const partner = {
        id: 123, name: "John Doe", email: "john@example.com", phone: "+1-555-0123",
        street: "108 West 13th Street", city: "Wilmington",
        state_id: [1, "Delaware"], zip: "19801", country_id: [233, "United States"],
      };
      const result = mapPartnerToContact(partner);
      expect(result).toEqual({
        name: "John Doe", email: "john@example.com", phone: "+1-555-0123",
        address: "108 West 13th Street", city: "Wilmington", state: "Delaware", zip: "19801",
      });
    });

    it("handles missing fields", () => {
      const partner = { id: 1, name: "No Info" };
      const result = mapPartnerToContact(partner);
      expect(result.name).toBe("No Info");
      expect(result.email).toBeUndefined();
    });
  });
});
