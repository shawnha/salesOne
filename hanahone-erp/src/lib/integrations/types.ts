import { Platform } from "@prisma/client";

export interface ConnectorResult {
  orders: ExternalOrderData[];
  inventory?: ExternalInventoryData[];
}

export interface ExternalOrderData {
  externalOrderId: string;
  externalOrderNumber?: string;
  rawData: any;
  orderDate: Date;
  fulfillmentStatus: string;
  financialStatus: string;
  totalAmount: number;
  refundAmount?: number;
  costAmount?: number;
  marginAmount?: number;
  customerName?: string;
  customerEmail?: string;
  shippingAddress?: string;
  recipientName?: string;
  recipientPhone?: string;
  items: ExternalOrderItemData[];
  /** Override the connector's platform for this order (e.g. CGETC order tagged as TIKTOK) */
  overridePlatform?: Platform;
  /** Channel label from source (e.g. "free gifting", "기타") */
  channelNote?: string;
}

export interface ExternalOrderItemData {
  externalItemId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface ExternalInventoryData {
  sku: string;
  productName: string;
  quantity: number;
  warehouseLocation?: string;
}

export interface Connector {
  platform: Platform;
  fetchOrders(credentials: any, since: Date | null): Promise<ExternalOrderData[]>;
  fetchInventory?(credentials: any): Promise<ExternalInventoryData[]>;
}

export interface SyncResult {
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string;
}
