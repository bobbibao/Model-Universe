export const PAWN_DISPOSAL_RULE = 'documented_costs_principal_interest_surplus_v1' as const;
export interface PawnDisposalCost {
  description: string;
  amountVnd: number;
  evidenceId: number;
  evidenceSha256: string;
}
export interface PawnDisposalStatement {
  status: 'offered' | 'accepted';
  rule: typeof PAWN_DISPOSAL_RULE;
  orderItemId: number;
  orderId: number;
  receiptId: number;
  receiptReference: string;
  refundIds: number[];
  netProceedsVnd: number;
  previousProceedsVnd: number;
  costs: PawnDisposalCost[];
  asOf: string;
  interestVnd: number;
  principalAppliedVnd: number;
  interestAppliedVnd: number;
  remainingVnd: number;
  surplusVnd: number;
  agreementText: string;
  signatureEvidenceIds: number[];
  payoutAccount: { bankName: string; accountNumber: string; holderName: string } | null;
}
export interface PawnDisposalEntry {
  id: number;
  kind: 'sale' | 'sale_revision' | 'repayment' | 'surplus';
  amountVnd: number;
  costsVnd: number;
  externalReference: string | null;
  orderItemId: number | null;
  statement: PawnDisposalStatement | null;
  createdAt: string;
}
export interface PawnDisposalSummary {
  proceedsVnd: number;
  costsVnd: number;
  repaymentsVnd: number;
  surplusPaidVnd: number;
  principalAppliedVnd: number;
  interestAppliedVnd: number;
  interestVnd: number;
  remainingVnd: number;
  surplusVnd: number;
  reconciliationRequired: boolean;
  entries: PawnDisposalEntry[];
  sales: { orderItemId: number; orderId: number; netProceedsVnd: number; recorded: boolean }[];
  evidence: { id: number; originalName: string }[];
}
