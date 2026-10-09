export type Tier = { name: string; points: number; discountPercent: number };
export type LoyaltyOverview = {
  active: boolean;
  policyVersion: number | null;
  balances: { available: number; debt: number; lifetime: number; used: number; tier: Tier; nextTier: Tier | null };
  rewards: {
    key: string;
    kind: 'fixed' | 'percent';
    points: number;
    amount: number;
    minOrderVnd: number;
    maxDiscountVnd: number;
  }[];
  gifts: { id: number; productId: number; titleEn: string; titleVi: string; pointsCost: number; available: boolean }[];
  history: {
    id: number;
    kind: string;
    balanceDelta: number;
    lifetimeDelta: number;
    reason: string;
    createdAt: string;
  }[];
  wallet: Redemption[];
  claims: HistoricalClaim[];
};
export type Redemption = {
  id: number;
  userId: number;
  pointsCost: number;
  giftProductId?: number | null;
  status: string;
  rewardSnapshot: { titleEn?: string; titleVi?: string; name?: string };
  shipping?: Record<string, string> | null;
  coupon?: { code: string; expirationDate: string; usedAt?: string | null; reservedOrderId?: number | null } | null;
};
export type HistoricalClaim = {
  id: number;
  userId: number;
  status: string;
  transactionReference: string;
  claimedVnd: number;
  recognizedVnd?: number | null;
  transactionDate: string;
  reviewReason?: string | null;
  evidence?: { id: number; originalName: string }[];
};
