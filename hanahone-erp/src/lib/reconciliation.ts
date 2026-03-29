export interface StockInputs {
  purchased: number;
  sold: number;
  adjusted: number;
}

export function calculateExpectedStock(inputs: StockInputs): number {
  return inputs.purchased - inputs.sold - inputs.adjusted;
}

// --- Baseline-forward types and logic ---

export type ChannelSales = Record<string, number>;

export type ReconciliationRow = {
  sku: string;
  productName: string;
  baseline: number;
  baselineSetAt: string;
  salesByChannel: ChannelSales;
  totalSales: number;
  adjusted: number;
  expected: number;
  actual: number;
  diff: number;
  reconciled: boolean;
};

export interface BaselineInputs {
  baseline: number;
  salesByChannel: ChannelSales;
  adjusted: number;
}

export function calculateBaselineExpected(inputs: BaselineInputs): number {
  const totalSales = Object.values(inputs.salesByChannel).reduce((sum, qty) => sum + qty, 0);
  return inputs.baseline - totalSales - inputs.adjusted;
}

// Shared data assembly — used by both page.tsx (RSC) and API route
export type BaselineData = {
  sku: string;
  productName: string;
  quantity: number;
  setAt: Date;
};

export type OrderItemData = {
  sku: string;
  quantity: number;
  orderDate: Date;
  channel: string;
};

export type AdjustmentData = {
  sku: string;
  quantity: number;
  createdAt: Date;
};

export function buildBaselineRows(
  baselines: BaselineData[],
  orderItems: OrderItemData[],
  adjustments: AdjustmentData[],
  actualBySku: Record<string, number>,
): ReconciliationRow[] {
  // Pre-group orderItems by SKU for O(baselines + orderItems)
  const orderItemsBySku = new Map<string, OrderItemData[]>();
  for (const item of orderItems) {
    const list = orderItemsBySku.get(item.sku) || [];
    list.push(item);
    orderItemsBySku.set(item.sku, list);
  }

  // Pre-group adjustments by SKU
  const adjustmentsBySku = new Map<string, AdjustmentData[]>();
  for (const adj of adjustments) {
    const list = adjustmentsBySku.get(adj.sku) || [];
    list.push(adj);
    adjustmentsBySku.set(adj.sku, list);
  }

  const rows: ReconciliationRow[] = baselines.map((bl) => {
    // Sales since baseline by channel
    const salesByChannel: ChannelSales = {};
    const skuItems = orderItemsBySku.get(bl.sku) || [];
    for (const item of skuItems) {
      if (item.orderDate <= bl.setAt) continue;
      salesByChannel[item.channel] = (salesByChannel[item.channel] || 0) + item.quantity;
    }

    // Adjustments since baseline
    let adjusted = 0;
    const skuAdj = adjustmentsBySku.get(bl.sku) || [];
    for (const adj of skuAdj) {
      if (adj.createdAt <= bl.setAt) continue;
      adjusted += adj.quantity;
    }

    const totalSales = Object.values(salesByChannel).reduce((sum, qty) => sum + qty, 0);
    const expected = calculateBaselineExpected({ baseline: bl.quantity, salesByChannel, adjusted });
    const actual = actualBySku[bl.sku] ?? 0;
    const diff = actual - expected;

    return {
      sku: bl.sku,
      productName: bl.productName,
      baseline: bl.quantity,
      baselineSetAt: bl.setAt.toISOString(),
      salesByChannel,
      totalSales,
      adjusted,
      expected,
      actual,
      diff,
      reconciled: diff === 0,
    };
  });

  // Sort: unreconciled first, then by absolute diff descending
  rows.sort((a, b) => {
    if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
    return Math.abs(b.diff) - Math.abs(a.diff);
  });

  return rows;
}
