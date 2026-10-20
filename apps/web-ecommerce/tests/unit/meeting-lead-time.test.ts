import { isMeetingSlotOpen, meetingSlotStart, openMeetingDays } from '../../src/shared/fulfillment';

describe('visit lead time (the shop needs time to prepare)', () => {
  // 2026-10-20 10:00 in Vietnam.
  const now = new Date(Date.UTC(2026, 9, 20, 3));

  it('reads slots in Vietnam time', () => {
    expect(meetingSlotStart('2026-10-21', '09-12').toISOString()).toBe('2026-10-21T02:00:00.000Z');
  });

  it('opens a slot only once it starts at least the lead time after now', () => {
    expect(isMeetingSlotOpen('2026-10-21', '09-12', 24, now)).toBe(false);
    expect(isMeetingSlotOpen('2026-10-21', '12-15', 24, now)).toBe(true);
    expect(isMeetingSlotOpen('2026-10-20', '15-18', 4, now)).toBe(true);
    expect(isMeetingSlotOpen('2026-10-20', '12-15', 4, now)).toBe(false);
  });

  it('lists the next days that still have an open slot', () => {
    expect(openMeetingDays(3, 24, now)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
    expect(openMeetingDays(2, 4, now)).toEqual(['2026-10-20', '2026-10-21']);
  });
});
