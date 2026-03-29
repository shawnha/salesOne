export interface NaverCredentials {
  clientId: string;
  clientSecret: string; // bcrypt salt format: $2a$04$...
}

export interface NaverTokenResponse {
  access_token: string;
  expires_in: number; // 10800 (3 hours)
  token_type: string; // "Bearer"
}

export interface NaverOrderInfo {
  orderId: string;
  orderDate: string;
  paymentDate: string;
  ordererName: string;
  ordererTel?: string;
}

export interface NaverProductOrderInfo {
  productOrderId: string;
  productOrderStatus: string;
  totalPaymentAmount: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  sellerProductCode?: string;
  optionCode?: string;
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

export interface NaverOrderDetail {
  order: NaverOrderInfo;
  productOrder: NaverProductOrderInfo;
}

export interface NaverChannelProduct {
  channelProductNo: number;
  name: string;
  statusType: string;
  salePrice: number;
  stockQuantity: number;
  sellerManagementCode?: string;
}

export interface NaverProduct {
  originProductNo: number;
  channelProducts: NaverChannelProduct[];
}

export interface NaverProductsResponse {
  contents: NaverProduct[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}
