export type BuybackStatus = 'submitted' | 'quoted' | 'awaiting_item' | 'inspecting' | 'awaiting_acceptance' | 'awaiting_payout' | 'completed' | 'returning' | 'cancelled';
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
export interface BuybackOffer { amountVnd: number; details: string }
export interface BuybackRequest {
  id: number;
  userId: number;
  status: BuybackStatus;
  version: number;
  asset: BuybackAsset;
  preliminaryOffer: BuybackOffer | null;
  finalOffer: BuybackOffer | null;
  inboundReference: string | null;
  inspection: string | null;
  ownershipTransferredAt: string | null;
  productId: number | null;
  returnTerms: { details: string; accepted: boolean; tracking: string | null } | null;
  createdAt: string;
  payout: { amountVnd: number; externalReference: string; createdAt: string } | null;
  evidence: { id: number; originalName: string }[];
  events: { id: number; action: string; details: Record<string, unknown>; createdAt: string }[];
}
