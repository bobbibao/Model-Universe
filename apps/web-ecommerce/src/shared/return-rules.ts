// Retained apparel reasons remain readable in historical transactions.
export const RETURN_REASONS = [
  'wrong_size',
  'defective',
  'not_as_described',
  'changed_mind',
  'other',
  'wrong_item',
  'missing_accessories',
  'undisclosed_defect',
  'shipping_damage',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const MODEL_RETURN_REASONS = RETURN_REASONS.filter((reason) => reason !== 'wrong_size');
export const SUPPORT_OUTCOMES = [
  'parts',
  'exchange',
  'repair',
  'partial_refund',
  'full_refund',
  'compensation',
] as const;
export type SupportOutcome = (typeof SUPPORT_OUTCOMES)[number];
