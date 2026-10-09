import { loyaltyBalances, pointsForNetMerchandise, LOYALTY_TIERS, LOYALTY_REWARDS } from '../../src/shared/loyalty-rules';

describe('source-backed member rules', () => {
  it.each([[0,0],[39999,0],[40000,1],[79999,1],[80000,2],[2147483647,53687]])('rounds %i whole merchandise VND to %i points', (amount,expected) => {
    expect(pointsForNetMerchandise(amount)).toBe(expected);
  });
  it.each([-1,1.5,NaN,Infinity,2147483648])('rejects unsupported amounts: %s', amount => expect(() => pointsForNetMerchandise(amount)).toThrow());
  it.each(LOYALTY_TIERS)('uses the exact $name threshold', tier => {
    expect(loyaltyBalances([{balanceDelta:tier.points,lifetimeDelta:tier.points,usedDelta:0}]).tier.name).toBe(tier.name);
    if (tier.points) expect(loyaltyBalances([{balanceDelta:tier.points-1,lifetimeDelta:tier.points-1,usedDelta:0}]).tier.name).not.toBe(tier.name);
  });
  it('keeps lifetime qualification on redemption and recovers reversal debt with future earnings', () => {
    const entries = [{balanceDelta:200,lifetimeDelta:200,usedDelta:0},{balanceDelta:-160,lifetimeDelta:0,usedDelta:160}];
    expect(loyaltyBalances(entries)).toMatchObject({available:40,lifetime:200,used:160,tier:{name:'BRONZE'}});
    entries.push({balanceDelta:-100,lifetimeDelta:-100,usedDelta:0});
    expect(loyaltyBalances(entries)).toMatchObject({available:0,debt:60,lifetime:100});
    entries.push({balanceDelta:100,lifetimeDelta:100,usedDelta:0});
    expect(loyaltyBalances(entries)).toMatchObject({available:40,debt:0,lifetime:200,used:160});
  });
  it('keeps all twelve shared source rewards without inventing gift inventory', () => {
    expect(LOYALTY_REWARDS).toHaveLength(12);
    expect(LOYALTY_REWARDS.find(reward => reward.key === 'fixed-60')).toMatchObject({points:60,amount:50000,minOrderVnd:500000});
    expect(LOYALTY_REWARDS.find(reward => reward.key === 'percent-800')).toMatchObject({points:800,amount:12,maxDiscountVnd:700000});
  });
});
