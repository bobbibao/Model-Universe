export type Tier = { name: string; points: number };
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
  // Orders that will earn points once completed (one point per whole 40,000 VND).
  // `creditsAt`: a completed order waiting for the return-control period before its points are credited.
  pending: { orderId: number; status: string; paymentStatus: string; createdAt: string; creditsAt: string | null; points: number }[];
};
export type Redemption = {
  id: number;
  userId: number;
  pointsCost: number;
  giftProductId?: number | null;
  status: string;
  rewardSnapshot: { titleEn?: string; titleVi?: string; name?: string };
  shipping?: Record<string, string> | null;
  coupon?: {
    code: string;
    expirationDate: string;
    usedAt?: string | null;
    reservedOrderId?: number | null;
    // What the point voucher takes off (a main voucher under the v6.2 checks).
    discountPercent?: number;
    fixedAmountVnd?: number | null;
    maxDiscountVnd?: number | null;
    minOrderVnd?: number;
  } | null;
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
