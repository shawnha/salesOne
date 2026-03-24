import { describe, it, expect } from "vitest";
import { parseTikTokCsv } from "@/lib/integrations/connectors/tiktok-csv";

describe("parseTikTokCsv", () => {
  it("parses TikTok Seller Center CSV format", () => {
    const csv = `Order ID,Order Status,Product Name,SKU,Quantity,Item Price,Order Total,Created Time
TK-001,Completed,Omega-3 Fish Oil,OMEGA3-1000,2,32000,64000,2026-03-20 14:30:00
TK-002,Shipped,Vitamin D3,VITD3-5000,1,18000,18000,2026-03-21 09:15:00`;

    const result = parseTikTokCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].externalOrderId).toBe("TK-001");
    expect(result[0].totalAmount).toBe(64000);
    expect(result[0].items[0].sku).toBe("OMEGA3-1000");
    expect(result[0].items[0].quantity).toBe(2);
    expect(result[1].status).toBe("shipped");
  });

  it("handles empty CSV", () => {
    const csv = `Order ID,Order Status,Product Name,SKU,Quantity,Item Price,Order Total,Created Time`;
    const result = parseTikTokCsv(csv);
    expect(result).toHaveLength(0);
  });
});
