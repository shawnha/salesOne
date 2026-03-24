import { Platform } from "@prisma/client";

export interface ConnectorResult {
  orders: ExternalOrderData[];
  inventory?: ExternalInventoryData[];
}

export interface ExternalOrderData {
  externalOrderId: string;
  rawData: any;
  orderDate: Date;
  status: string;
  totalAmount: number;
  costAmount?: number;
  marginAmount?: number;
  customerName?: string;
  customerEmail?: string;
  items: ExternalOrderItemData[];
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
