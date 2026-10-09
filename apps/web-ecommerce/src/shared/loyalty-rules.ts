// Source S6/S7. Activation, expiry and stacking still require an approved policy snapshot.
export const LOYALTY_TIERS = [
  { name: 'MEMBER', points: 0, discountPercent: 0 },
  { name: 'BRONZE', points: 150, discountPercent: 2 },
  { name: 'SILVER', points: 250, discountPercent: 4 },
  { name: 'GOLD', points: 500, discountPercent: 6 },
  { name: 'PLATINUM', points: 1500, discountPercent: 10 },
  { name: 'EMERALD', points: 3500, discountPercent: 12 },
  { name: 'DIAMOND', points: 10000, discountPercent: 15 },
] as const;
export const LOYALTY_REWARDS = [
  ...[[60,50000,500000],[110,100000,1000000],[160,150000,1500000],[210,200000,2000000],[500,500000,5000000],[900,1000000,10000000]].map(([points,amount,minOrderVnd]) => ({ key:`fixed-${points}`, kind:'fixed' as const, points, amount, minOrderVnd, maxDiscountVnd:amount })),
  ...[[50,2,100000],[100,3,150000],[200,5,250000],[350,7,300000],[500,10,500000],[800,12,700000]].map(([points,amount,maxDiscountVnd]) => ({ key:`percent-${points}`, kind:'percent' as const, points, amount, minOrderVnd:0, maxDiscountVnd })),
];
export const pointsForNetMerchandise = (amount: number) => {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new Error('Invalid net merchandise amount.');
  return Math.floor(amount / 40000);
};
export const loyaltyBalances = (entries: { balanceDelta: number; lifetimeDelta: number; usedDelta: number }[]) => {
  const totals = entries.reduce((sum, entry) => ({ balance:sum.balance+entry.balanceDelta, lifetime:sum.lifetime+entry.lifetimeDelta, used:sum.used+entry.usedDelta }),{balance:0,lifetime:0,used:0});
  const lifetime = Math.max(0,totals.lifetime);
  const tier = [...LOYALTY_TIERS].reverse().find(item => lifetime >= item.points)!;
  const nextTier = LOYALTY_TIERS.find(item => item.points > lifetime) || null;
  return { available:Math.max(0,totals.balance), debt:Math.max(0,-totals.balance), lifetime, used:Math.max(0,totals.used), tier, nextTier };
};
