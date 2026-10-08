import { DAY_MS, reservationDays, reservationDeadline } from '../../src/shared/reservation';

describe('reservation source policy boundaries', () => {
  it.each([[500000,15],[520000,15],[549999,15],[550000,25],[650000,45],[750000,65],[950000,105],[1000000,115]])('earns complete 5%% steps for %i VND', (paid, days) => {
    expect(reservationDays(1000000, paid)).toBe(days);
  });
  it('measures top-ups and extensions from the original confirmed start', () => {
    const start = new Date('2026-10-08T03:00:00Z');
    expect(reservationDeadline(start, 1000000, 650000, 7).getTime()).toBe(start.getTime() + 52 * DAY_MS);
  });
  it('does not round a fractional VND deposit below the required half', () => {
    expect(() => reservationDays(1000001, 500000)).toThrow(RangeError);
    expect(reservationDays(1000001, 500001)).toBe(15);
  });
  it.each([0,-1,499999,1000001,500000.5,NaN])('rejects an invalid confirmed amount %s', paid => {
    expect(() => reservationDays(1000000, paid)).toThrow(RangeError);
  });
});
