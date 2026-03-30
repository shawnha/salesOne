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
  ordererId?: string; // 네이버 아이디 (e.g. "wang******")
  ordererNo?: string; // 네이버 회원번호
  paymentMeans?: string; // 결제수단 (e.g. "신용카드 간편결제")
}

export interface NaverDeliveryInfo {
  sendDate?: string;
  deliveredDate?: string;
  trackingNumber?: string;
  deliveryCompany?: string;
  deliveryStatus?: string;
  deliveryMethod?: string;
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
  productId?: string; // 채널상품번호
  originalProductId?: string; // 원상품번호
  sellerCustomCode1?: string; // 판매자 내부코드1 (공구 태그 등)
  sellerCustomCode2?: string; // 판매자 내부코드2
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
  delivery?: NaverDeliveryInfo;
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
