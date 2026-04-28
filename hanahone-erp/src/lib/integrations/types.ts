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
  customerPhone?: string;
  shippingAddress?: string;
  recipientName?: string;
  recipientPhone?: string;
  items: ExternalOrderItemData[];
  /** Override the connector's platform for this order (e.g. CGETC order tagged as TIKTOK) */
  overridePlatform?: Platform;
  /** Channel label from source (e.g. "free gifting", "기타") */
  channelNote?: string;
  /** Override order type (e.g. SEEDING for free gifting orders) */
  orderType?: string;
  /** Platform settlement amount (after fees) */
  settlementAmount?: number;
  /** Platform commission/fees */
  commissionAmount?: number;
  /** Carrier tracking number (e.g. CJ대한통운 송장 번호, FedEx tracking #) */
  trackingNumber?: string;
  /** Carrier name (e.g. "CJ대한통운", "FedEx", "WILL CALL") */
  trackingCarrier?: string;
  /** Actual ship date from carrier/picking record */
  shipDate?: Date;
}

export interface ExternalOrderItemData {
  externalItemId: string;
  productName: string;
  sku: string;
  quantity: number;
  /** Customer-paid unit price (post-discount). */
  unitPrice: number;
  /** List/sticker price before discount, when the channel exposes it. */
  originalUnitPrice?: number;
  /** Total discount allocated to this line item (positive number). */
  discountAmount?: number;
  /** Subscription program identifier (Shopify _selling_plan_id). */
  sellingPlanId?: string;
}

export interface ExternalInventoryData {
  sku: string;
  productName: string;
  quantity: number;
  warehouseLocation?: string;
}

export interface Connector {
  platform: Platform;
  fetchOrders(credentials: any, since: Date | null, companyId?: string): Promise<ExternalOrderData[]>;
  fetchInventory?(credentials: any): Promise<ExternalInventoryData[]>;
}

export interface SyncResult {
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string;
}
