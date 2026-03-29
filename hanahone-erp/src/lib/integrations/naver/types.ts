export interface NaverCredentials {
  clientId: string;
  clientSecret: string; // bcrypt salt format: $2a$04$...
}

export interface NaverTokenResponse {
  access_token: string;
  expires_in: number; // 10800 (3 hours)
  token_type: string; // "Bearer"
}

export interface NaverProductOrder {
  productOrderId: string;
  orderId: string;
  orderDate: string;
  paymentDate: string;
  productOrderStatus: string;
  totalPaymentAmount: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  sellerProductCode: string;
  ordererName: string;
  ordererTel?: string;
  shippingAddress?: {
    name: string;
    tel1: string;
    baseAddress: string;
    detailAddress: string;
    zipCode: string;
  };
  claimType?: string;
  claimStatus?: string;
  claimPrice?: number;
}

export interface NaverLastChangedStatusesResponse {
  data: {
    lastChangeStatuses: Array<{
      productOrderId: string;
      orderId: string;
      lastChangedDate: string;
      lastChangedType: string;
    }>;
  };
}

export interface NaverProductOrdersResponse {
  data: NaverProductOrder[];
}

export interface NaverProduct {
  originProductNo: number;
  name: string;
  salePrice: number;
  stockQuantity: number;
  sellerManagementCode?: string;
  channelProducts?: Array<{
    channelProductNo: number;
    name: string;
    statusType: string;
  }>;
}

export interface NaverProductsResponse {
  contents: NaverProduct[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}
