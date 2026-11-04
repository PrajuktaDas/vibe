import 'reflect-metadata';
import {describe, expect, it} from 'vitest';
import {SlotBookingStatus} from '#shared/interfaces/models.js';
import {buildLearningCalendar} from '../services/learningCalendar.js';

const booking = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: 'booking-1',
    userId: 'student-1',
    enrollmentId: 'enrollment-1',
    courseId: 'course-1',
    courseVersionId: 'version-1',
    date: '2026-11-03',
    from: '14:00',
    to: '16:00',
    overnight: false,
    kind: 'REGULAR',
    status: SlotBookingStatus.BOOKED,
    hoursReserved: 2,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  }) as any;

const session = (start: string, end: string, overrides: Record<string, unknown> = {}) =>
  ({
    userId: 'student-1',
    courseId: 'course-1',
    courseVersionId: 'version-1',
    itemId: 'item-1',
    startTime: new Date(start),
    endTime: new Date(end),
    ...overrides,
  }) as any;

describe('buildLearningCalendar', () => {
  it('maps full booked-slot utilisation to the highest intensity', () => {
    const result = buildLearningCalendar({
      bookings: [booking()],
      sessions: [session('2026-11-03T08:30:00.000Z', '2026-11-03T10:30:00.000Z')],
      bookingRequiredByCourse: {'course-1:version-1': true},
      from: '2026-11-03',
      to: '2026-11-03',
    });

    expect(result.days[0].bookedMinutes).toBe(120);
    expect(result.days[0].utilisedBookedMinutes).toBe(120);
    expect(result.days[0].bookedUtilizationPct).toBe(100);
    expect(result.days[0].intensityLevel).toBe(4);
  });

  it('maps 25 percent booked utilisation to the lightest active intensity', () => {
    const result = buildLearningCalendar({
      bookings: [booking()],
      sessions: [session('2026-11-03T08:30:00.000Z', '2026-11-03T09:00:00.000Z')],
      bookingRequiredByCourse: {'course-1:version-1': true},
      from: '2026-11-03',
      to: '2026-11-03',
    });

    expect(result.days[0].bookedUtilizationPct).toBe(25);
    expect(result.days[0].intensityLevel).toBe(1);
  });

  it('uses actual learning duration for courses without slot booking', () => {
    const result = buildLearningCalendar({
      bookings: [],
      sessions: [session('2026-11-03T08:30:00.000Z', '2026-11-03T09:15:00.000Z')],
      bookingRequiredByCourse: {'course-1:version-1': false},
      from: '2026-11-03',
      to: '2026-11-03',
    });

    expect(result.days[0].nonBookedLearningMinutes).toBe(45);
    expect(result.days[0].totalLearningMinutes).toBe(45);
    expect(result.days[0].intensityLevel).toBe(2);
  });

  it('merges overlapping watch sessions instead of double-counting minutes', () => {
    const result = buildLearningCalendar({
      bookings: [],
      sessions: [
        session('2026-11-03T08:30:00.000Z', '2026-11-03T09:15:00.000Z'),
        session('2026-11-03T09:00:00.000Z', '2026-11-03T09:30:00.000Z'),
      ],
      bookingRequiredByCourse: {'course-1:version-1': false},
      from: '2026-11-03',
      to: '2026-11-03',
    });

    expect(result.days[0].nonBookedLearningMinutes).toBe(60);
  });
});
