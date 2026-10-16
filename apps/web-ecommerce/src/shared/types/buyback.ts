import type { BuybackEstimate, BuybackIssue, InspectionComparison } from '../buyback-pricing';

// need_more_evidence: staff (or the automatic media check) asked for more photos/video before a preliminary quote.
// reinspection_requested: the customer disputes the inspected issues; no final price can be accepted until staff
// answer with a new final offer.
export type BuybackStatus =
  | 'submitted'
  | 'need_more_evidence'
  | 'quoted'
  | 'awaiting_item'
  | 'inspecting'
  | 'awaiting_acceptance'
  | 'reinspection_requested'
  | 'awaiting_payout'
  | 'completed'
  | 'returning'
  | 'cancelled';
export interface BuybackAsset {
  name: string;
  modelCode: string;
  version: string;
  assemblyState: string;
  boxCondition: string;
  accessories: string;
  defects: string;
  repairHistory: string;
}
export interface BuybackOffer {
  amountVnd: number;
  details: string;
  // How the amount was reached: the 2.0 formula, or a manual price with its reason.
  basis?: 'formula' | 'manual';
}
export interface BuybackEvidenceFile {
  id: number;
  originalName: string;
  mimeType: string;
  purpose: string;
}
export interface BuybackRequest {
  id: number;
  userId: number;
  status: BuybackStatus;
  version: number;
  asset: BuybackAsset;
  referenceProductId: number | null;
  referenceProduct: { id: number; name: string; sku: string; priceVnd: number } | null;
  declaredIssues: BuybackIssue[];
  estimate: BuybackEstimate | null;
  inspectedIssues: BuybackIssue[] | null;
  comparison: InspectionComparison | null;
  evidenceRequest: string | null;
  reviewRequest: string | null;
  preliminaryOffer: BuybackOffer | null;
  finalOffer: BuybackOffer | null;
  inboundReference: string | null;
  inspection: string | null;
  ownershipTransferredAt: string | null;
  productId: number | null;
  returnTerms: { details: string; accepted: boolean; tracking: string | null } | null;
  createdAt: string;
  payout: { amountVnd: number; externalReference: string; createdAt: string } | null;
  evidence: BuybackEvidenceFile[];
  inspectionEvidence: BuybackEvidenceFile[];
  events: { id: number; action: string; details: Record<string, unknown>; createdAt: string }[];
}
