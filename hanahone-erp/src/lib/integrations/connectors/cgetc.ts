import type { Connector, ExternalOrderData, ExternalInventoryData } from "../types";

// CGETC ERP connector — Phase 1: stub with documented interface
// Phase 2: implement after reverse-engineering the CGETC web API endpoints
// See spec for connection details (credentials stored encrypted in IntegrationConfig)

export const cgetcConnector: Connector = {
  platform: "CGETC",

  async fetchOrders(_credentials: any, _since: Date | null) {
    // CGETC is primarily used for inventory, not orders
    // TikTok order data from CGETC is a future V2 feature
    return [];
  },

  async fetchInventory(credentials: { url: string; email: string; password: string; partnerId: string }): Promise<ExternalInventoryData[]> {
    // Phase 1: Stub — returns empty until CGETC API endpoints are discovered
    // Phase 2: Implement login flow + inventory fetch after network analysis
    //
    // Expected flow:
    // 1. POST login to credentials.url with email/password
    // 2. Use session cookie to fetch inventory endpoint
    // 3. Map response to ExternalInventoryData[]
    //
    // TODO: Replace this stub after CGETC API spike
    console.warn("CGETC connector: stub — implement after API discovery");
    return [];
  },
};
