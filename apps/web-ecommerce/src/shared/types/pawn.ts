import type { BuybackAsset } from './buyback';
import type { PawnInterestPolicy } from '../pawn-rules';
import type { PawnDisposalStatement, PawnDisposalSummary } from './pawn-disposal';
export type PawnStatus = 'submitted' | 'quoted' | 'accepted' | 'contract_confirmed' | 'in_custody' | 'active' | 'repaid' | 'returned' | 'cancelled' | 'disposed';
export interface PawnTerms {
  appraisalVnd: number;
  principalVnd: number;
  termDays: number;
  contractText: string;
  disposalAfterGrace: boolean;
  policyVersion: number;
  policy: PawnInterestPolicy;
}
export interface PawnContract {
  id: number;
  userId: number;
  status: PawnStatus;
  version: number;
  asset: BuybackAsset;
  terms: PawnTerms | null;
  contractReference: string | null;
  contractEvidenceIds: number[];
  custodyAt: string | null;
  custodyReference: string | null;
  disbursedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  handbackAt: string | null;
  disposedAt: string | null;
  disposalSettledAt: string | null;
  disposalStatement: PawnDisposalStatement | null;
  disposal: PawnDisposalSummary | null;
  productId: number | null;
  extensionRequest: { proposedDueAt: string; reason: string } | null;
  createdAt: string;
  overdue: boolean;
  estimate: { asOf: string; days: number; interestVnd: number; capped: boolean; collectedVnd: number; remainingVnd: number };
  evidence: { id: number; originalName: string }[];
  events: { id: number; action: string; details: Record<string, unknown>; createdAt: string }[];
  payments: { id: number; kind: 'disbursement' | 'redemption'; amountVnd: number; principalVnd: number; interestVnd: number; externalReference: string; createdAt: string }[];
}
