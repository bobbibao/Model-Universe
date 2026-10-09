import { allocateVnd } from '../../src/shared/money-allocation';

describe('whole-VND allocation of an existing order amount', () => {
  it('keeps the exact total with stable tie-breaking independent of input order', () => {
    const lines = [{ id: 9, valueVnd: 100 }, { id: 2, valueVnd: 100 }, { id: 5, valueVnd: 100 }];
    expect(allocateVnd(2, lines)).toEqual(new Map([[2, 1], [5, 1], [9, 0]]));
    expect(allocateVnd(2, lines.reverse())).toEqual(new Map([[2, 1], [5, 1], [9, 0]]));
  });
  it('does not lose precision at the supported merchandise boundary', () => {
    const lines = [{ id: 1, valueVnd: 2147483646 }, { id: 2, valueVnd: 1 }];
    const shares = allocateVnd(2147483646, lines);
    expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(2147483646);
    expect(shares.get(2)).toBe(1);
  });
  it('rejects over-allocation, duplicate identities and non-integer money', () => {
    expect(() => allocateVnd(101, [{ id: 1, valueVnd: 100 }])).toThrow();
    expect(() => allocateVnd(1, [{ id: 1, valueVnd: 10 }, { id: 1, valueVnd: 20 }])).toThrow();
    expect(() => allocateVnd(0.5, [{ id: 1, valueVnd: 10 }])).toThrow();
    expect(allocateVnd(0, [{ id: 1, valueVnd: 0 }]).get(1)).toBe(0);
  });
});
