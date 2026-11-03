import type {
  ISlotBooking,
  IWatchTime,
} from '#shared/interfaces/models.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

interface Interval {
  start: number;
  end: number;
}

interface BookingEntry {
  booking: ISlotBooking;
  window: Interval;
  bookedMinutes: number;
}

export interface LearningCalendarBooking {
  bookingId: string;
  courseId: string;
  courseVersionId: string;
  from: string;
  to: string;
  bookedMinutes: number;
  utilisedMinutes: number;
  utilizationPct: number;
  status: string;
}

export interface LearningCalendarCourse {
  courseId: string;
  courseVersionId: string;
  learningMinutes: number;
}

export interface LearningCalendarDay {
  date: string;
  bookedMinutes: number;
  utilisedBookedMinutes: number;
  nonBookedLearningMinutes: number;
  additionalLearningMinutes: number;
  totalLearningMinutes: number;
  actualLearningMinutes: number;
  bookedUtilizationPct: number;
  intensityLevel: number;
  bookings: LearningCalendarBooking[];
  nonBookedCourses: LearningCalendarCourse[];
}

export interface LearningCalendarResponse {
  from: string;
  to: string;
  days: LearningCalendarDay[];
  summary: {
    totalBookedMinutes: number;
    totalUtilisedBookedMinutes: number;
    totalNonBookedLearningMinutes: number;
    totalLearningMinutes: number;
    totalActualLearningMinutes: number;
    activeDays: number;
    averageSlotUtilizationPct: number | null;
    currentStreak: number;
  };
}

export function isValidISTDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function addISTDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** UTC instant corresponding to midnight at the start of an IST date. */
export function getISTMidnightUTC(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day) - IST_OFFSET_MS;
}

function getISTDateKey(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function bookingWindow(booking: ISlotBooking): BookingEntry {
  const startMinutes = toMinutes(booking.from);
  let endMinutes = toMinutes(booking.to);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;

  const start = getISTMidnightUTC(booking.date) + startMinutes * 60_000;
  const end = getISTMidnightUTC(booking.date) + endMinutes * 60_000;
  const windowMinutes = endMinutes - startMinutes;
  const reservedMinutes = Number(booking.hoursReserved ?? 0) * 60;

  return {
    booking,
    window: {start, end},
    bookedMinutes: reservedMinutes > 0 ? reservedMinutes : windowMinutes,
  };
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) return [];
  const sorted = [...intervals]
    .filter(interval => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({...interval});
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function intervalMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce(
    (total, interval) => total + (interval.end - interval.start) / 60_000,
    0,
  );
}

function intersectionMinutes(sessions: Interval[], windows: Interval[]): number {
  const left = mergeIntervals(sessions);
  const right = mergeIntervals(windows);
  let i = 0;
  let j = 0;
  let milliseconds = 0;

  while (i < left.length && j < right.length) {
    const overlap = Math.min(left[i].end, right[j].end) -
      Math.max(left[i].start, right[j].start);
    if (overlap > 0) milliseconds += overlap;

    if (left[i].end <= right[j].end) i++;
    else j++;
  }

  return milliseconds / 60_000;
}

function splitIntervalsByISTDay(intervals: Interval[]): Map<string, Interval[]> {
  const result = new Map<string, Interval[]>();

  for (const interval of mergeIntervals(intervals)) {
    let cursor = interval.start;
    while (cursor < interval.end) {
      const date = getISTDateKey(new Date(cursor));
      const nextMidnight = getISTMidnightUTC(addISTDays(date, 1));
      const segmentEnd = Math.min(interval.end, nextMidnight);
      const segments = result.get(date) ?? [];
      segments.push({start: cursor, end: segmentEnd});
      result.set(date, segments);
      cursor = segmentEnd;
    }
  }

  return result;
}

function intensityForDay(bookedUtilizationPct: number, nonBookedMinutes: number): number {
  let bookedLevel = 0;
  if (bookedUtilizationPct > 0 && bookedUtilizationPct < 50) bookedLevel = 1;
  else if (bookedUtilizationPct >= 50 && bookedUtilizationPct < 75) bookedLevel = 2;
  else if (bookedUtilizationPct >= 75 && bookedUtilizationPct < 100) bookedLevel = 3;
  else if (bookedUtilizationPct >= 100) bookedLevel = 4;

  let nonBookedLevel = 0;
  if (nonBookedMinutes > 0 && nonBookedMinutes < 30) nonBookedLevel = 1;
  else if (nonBookedMinutes >= 30 && nonBookedMinutes < 60) nonBookedLevel = 2;
  else if (nonBookedMinutes >= 60 && nonBookedMinutes < 120) nonBookedLevel = 3;
  else if (nonBookedMinutes >= 120) nonBookedLevel = 4;

  return Math.max(bookedLevel, nonBookedLevel);
}

function createEmptyDay(date: string): LearningCalendarDay {
  return {
    date,
    bookedMinutes: 0,
    utilisedBookedMinutes: 0,
    nonBookedLearningMinutes: 0,
    additionalLearningMinutes: 0,
    totalLearningMinutes: 0,
    actualLearningMinutes: 0,
    bookedUtilizationPct: 0,
    intensityLevel: 0,
    bookings: [],
    nonBookedCourses: [],
  };
}

export function buildLearningCalendar(input: {
  bookings: ISlotBooking[];
  sessions: IWatchTime[];
  bookingRequiredByCourse: Record<string, boolean>;
  from: string;
  to: string;
}): LearningCalendarResponse {
  const {bookings, sessions, bookingRequiredByCourse, from, to} = input;
  const days = new Map<string, LearningCalendarDay>();

  for (let date = from; date <= to; date = addISTDays(date, 1)) {
    days.set(date, createEmptyDay(date));
  }

  const sessionIntervalsByCourse = new Map<string, Interval[]>();
  for (const session of sessions) {
    const courseId = String(session.courseId);
    const courseVersionId = String(session.courseVersionId);
    const key = courseId + ':' + courseVersionId;
    const start = new Date(session.startTime).getTime();
    const end = new Date(session.endTime ?? session.lastSeenAt ?? session.startTime).getTime();

    // An open or abandoned session with no last ping has no measurable duration.
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const intervals = sessionIntervalsByCourse.get(key) ?? [];
    intervals.push({start, end});
    sessionIntervalsByCourse.set(key, intervals);
  }

  const bookingEntriesByCourse = new Map<string, BookingEntry[]>();
  for (const booking of bookings) {
    const key = String(booking.courseId) + ':' + String(booking.courseVersionId);
    const entries = bookingEntriesByCourse.get(key) ?? [];
    entries.push(bookingWindow(booking));
    bookingEntriesByCourse.set(key, entries);
  }

  const courseKeys = new Set([
    ...sessionIntervalsByCourse.keys(),
    ...bookingEntriesByCourse.keys(),
  ]);

  for (const key of courseKeys) {
    const sessionIntervals = mergeIntervals(sessionIntervalsByCourse.get(key) ?? []);
    const sessionsByDate = splitIntervalsByISTDay(sessionIntervals);
    const bookingEntries = bookingEntriesByCourse.get(key) ?? [];
    const requiresBooking = bookingRequiredByCourse[key] === true || bookingEntries.length > 0;

    if (!requiresBooking) {
      for (const [date, intervals] of sessionsByDate) {
        const day = days.get(date);
        if (!day) continue;
        const minutes = intervalMinutes(intervals);
        if (minutes <= 0) continue;

        day.nonBookedLearningMinutes += minutes;
        day.nonBookedCourses.push({
          courseId: key.slice(0, key.indexOf(':')),
          courseVersionId: key.slice(key.indexOf(':') + 1),
          learningMinutes: Math.round(minutes),
        });
      }
      continue;
    }

    const bookingSegmentsByDate = new Map<string, Interval[]>();
    const bookedMinutesByDate = new Map<string, number>();

    for (const entry of bookingEntries) {
      const segments = splitIntervalsByISTDay([entry.window]);
      for (const [date, intervals] of segments) {
        const current = bookingSegmentsByDate.get(date) ?? [];
        current.push(...intervals);
        bookingSegmentsByDate.set(date, current);
        bookedMinutesByDate.set(
          date,
          (bookedMinutesByDate.get(date) ?? 0) + intervalMinutes(intervals),
        );
      }

      const startDay = days.get(entry.booking.date);
      if (startDay) {
        const utilised = Math.min(
          entry.bookedMinutes,
          intersectionMinutes(sessionIntervals, [entry.window]),
        );
        const pct = entry.bookedMinutes > 0
          ? Math.min(100, Math.round((utilised / entry.bookedMinutes) * 100))
          : 0;

        startDay.bookings.push({
          bookingId: String(entry.booking._id ?? ''),
          courseId: String(entry.booking.courseId),
          courseVersionId: String(entry.booking.courseVersionId),
          from: entry.booking.from,
          to: entry.booking.to,
          bookedMinutes: Math.round(entry.bookedMinutes),
          utilisedMinutes: Math.round(utilised),
          utilizationPct: pct,
          status: String(entry.booking.status),
        });
      }
    }

    const activityDates = new Set([
      ...sessionsByDate.keys(),
      ...bookingSegmentsByDate.keys(),
    ]);

    for (const date of activityDates) {
      const day = days.get(date);
      if (!day) continue;
      const sessionIntervalsForDay = mergeIntervals(sessionsByDate.get(date) ?? []);
      const bookingWindowsForDay = mergeIntervals(bookingSegmentsByDate.get(date) ?? []);
      const bookedMinutes = bookedMinutesByDate.get(date) ?? 0;
      const utilised = Math.min(
        bookedMinutes,
        intersectionMinutes(sessionIntervalsForDay, bookingWindowsForDay),
      );
      const actual = intervalMinutes(sessionIntervalsForDay);

      day.bookedMinutes += bookedMinutes;
      day.utilisedBookedMinutes += utilised;
      day.additionalLearningMinutes += Math.max(0, actual - utilised);
    }
  }

  const orderedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of orderedDays) {
    day.bookedMinutes = Math.round(day.bookedMinutes);
    day.utilisedBookedMinutes = Math.round(day.utilisedBookedMinutes);
    day.nonBookedLearningMinutes = Math.round(day.nonBookedLearningMinutes);
    day.additionalLearningMinutes = Math.round(day.additionalLearningMinutes);
    day.totalLearningMinutes = day.utilisedBookedMinutes + day.nonBookedLearningMinutes;
    day.actualLearningMinutes = day.totalLearningMinutes + day.additionalLearningMinutes;
    day.bookedUtilizationPct = day.bookedMinutes > 0
      ? Math.min(100, Math.round((day.utilisedBookedMinutes / day.bookedMinutes) * 100))
      : 0;
    day.intensityLevel = intensityForDay(
      day.bookedUtilizationPct,
      day.nonBookedLearningMinutes,
    );
    day.bookings.sort((a, b) => a.from.localeCompare(b.from));
    day.nonBookedCourses.sort((a, b) => b.learningMinutes - a.learningMinutes);
  }

  const totalBookedMinutes = orderedDays.reduce((sum, day) => sum + day.bookedMinutes, 0);
  const totalUtilisedBookedMinutes = orderedDays.reduce(
    (sum, day) => sum + day.utilisedBookedMinutes,
    0,
  );
  const totalNonBookedLearningMinutes = orderedDays.reduce(
    (sum, day) => sum + day.nonBookedLearningMinutes,
    0,
  );
  const totalLearningMinutes = totalUtilisedBookedMinutes + totalNonBookedLearningMinutes;
  const totalActualLearningMinutes = orderedDays.reduce(
    (sum, day) => sum + day.actualLearningMinutes,
    0,
  );
  const activeDays = orderedDays.filter(day => day.intensityLevel > 0).length;

  const today = getISTDateKey(new Date());
  let streakCursor = to <= today ? to : today;
  const activeOn = (date: string) => (days.get(date)?.intensityLevel ?? 0) > 0;

  if (!activeOn(streakCursor)) streakCursor = addISTDays(streakCursor, -1);
  let currentStreak = 0;
  while (streakCursor >= from && activeOn(streakCursor)) {
    currentStreak++;
    streakCursor = addISTDays(streakCursor, -1);
  }

  return {
    from,
    to,
    days: orderedDays,
    summary: {
      totalBookedMinutes,
      totalUtilisedBookedMinutes,
      totalNonBookedLearningMinutes,
      totalLearningMinutes,
      totalActualLearningMinutes,
      activeDays,
      averageSlotUtilizationPct: totalBookedMinutes > 0
        ? Math.round((totalUtilisedBookedMinutes / totalBookedMinutes) * 100)
        : null,
      currentStreak,
    },
  };
}
