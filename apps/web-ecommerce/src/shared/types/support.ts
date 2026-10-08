import type { SupportOutcome } from '../return-rules';
export type SupportTerms = {
  outcome: SupportOutcome;
  details: string;
  refundVnd: number;
  replacement?: {
    productId: number;
    name: string;
    sku: string;
    imageUrl: string;
    quantity: number;
    condition: string;
    grade: string | null;
    scale: string | null;
    defects: string[];
    includedAccessories: string[];
    assemblyState: string;
    boxCondition: string | null;
  } | null;
};
export type SupportCase = {
  id: number;
  orderId: number;
  userId: number;
  status: string;
  resolutionVersion: number;
  resolutionStatus?: 'pending' | 'offered' | 'accepted' | 'rejected' | 'resolved' | null;
  resolutionTerms?: SupportTerms | null;
  evidence?: { id: number; originalName: string }[];
  events?: { id: number; action: string; details: Record<string, unknown>; createdAt: string }[];
};
