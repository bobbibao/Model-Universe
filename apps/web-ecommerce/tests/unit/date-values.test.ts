import { dateValue, parseDateValue } from '../../src/components/DateTimeInput/date-values';

describe('shared calendar values', () => {
  it('preserves local date and time values for native forms', () => {
    expect(dateValue(new Date(2024, 1, 29))).toBe('2024-02-29');
    expect(dateValue(new Date(2026, 9, 19, 20, 30), true)).toBe('2026-10-19T20:30');
    expect(dateValue(parseDateValue('2024-02-29')!)).toBe('2024-02-29');
  });
  it.each(['2025-02-29', '2026-13-01', '2026-10-32', '2026-10-19T25:30', '2026-10-19T20:60', '19/10/2026'])(
    'rejects impossible or ambiguous dates: %s',
    (value) => {
      expect(parseDateValue(value)).toBeUndefined();
    },
  );
});
