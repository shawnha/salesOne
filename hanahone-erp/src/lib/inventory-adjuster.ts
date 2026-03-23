export function calculateAdjustment(
  currentQuantity: number,
  change: number,
  type: string
): { previousQuantity: number; newQuantity: number; quantityChange: number; adjustmentType: string } {
  const newQuantity = currentQuantity + change;
  if (newQuantity < 0) throw new Error("Insufficient inventory");
  return { previousQuantity: currentQuantity, newQuantity, quantityChange: change, adjustmentType: type };
}
