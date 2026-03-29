export interface StockInputs {
  purchased: number;
  sold: number;
  adjusted: number;
}

export function calculateExpectedStock(inputs: StockInputs): number {
  return inputs.purchased - inputs.sold - inputs.adjusted;
}
