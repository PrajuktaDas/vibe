import {useEffect, useMemo, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {CalendarDays, Clock3, Flame, Target, RefreshCw} from "lucide-react";
import {useAuthStore} from "@/store/auth-store";

type CalendarBooking = {
  bookingId: string;
  courseId: string;
  courseVersionId: string;
  from: string;
  to: string;
  bookedMinutes: number;
  utilisedMinutes: number;
  utilizationPct: number;
  status: string;
};

type CalendarCourse = {
  courseId: string;
  courseVersionId: string;
  learningMinutes: number;
};

type CalendarDay = {
  date: string;
  bookedMinutes: number;
  utilisedBookedMinutes: number;
  nonBookedLearningMinutes: number;
  additionalLearningMinutes: number;
  totalLearningMinutes: number;
  actualLearningMinutes: number;
  bookedUtilizationPct: number;
  intensityLevel: number;
  bookings: CalendarBooking[];
  nonBookedCourses: CalendarCourse[];
};

type CalendarResponse = {
  from: string;
  to: string;
  days: CalendarDay[];
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
};

const LEVEL_CLASSES = [
  "bg-slate-100 dark:bg-slate-800",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-600 dark:bg-emerald-500",
  "bg-emerald-800 dark:bg-emerald-300",
];

function istDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date + "T00:00:00+05:30"));
}

function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (hours && remainder) return hours + "h " + remainder + "m";
  if (hours) return hours + "h";
  return remainder + "m";
}

function rangeStart(months: number, today: string): string {
  const [year, month] = today.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  first.setUTCMonth(first.getUTCMonth() - (months - 1));
  return [
    first.getUTCFullYear(),
    String(first.getUTCMonth() + 1).padStart(2, "0"),
    "01",
  ].join("-");
}

function buildCells(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const end = new Date(Date.UTC(toYear, toMonth - 1, toDay));
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const cells: Array<{date: string; inRange: boolean}> = [];
  while (cursor <= end) {
    const date = [
      cursor.getUTCFullYear(),
      String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      String(cursor.getUTCDate()).padStart(2, "0"),
    ].join("-");
    cells.push({date, inRange: date >= from && date <= to});
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cells;
}

function dayStreak(days: CalendarDay[], today: string): number {
  const active = new Set(days.filter((day) => day.intensityLevel > 0).map((day) => day.date));
  let cursor = today;
  if (!active.has(cursor)) {
    const [year, month, date] = cursor.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 1, date - 1));
    cursor = [
      previous.getUTCFullYear(),
      String(previous.getUTCMonth() + 1).padStart(2, "0"),
      String(previous.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  let streak = 0;
  while (active.has(cursor)) {
    streak++;
    const [year, month, date] = cursor.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 1, date - 1));
    cursor = [
      previous.getUTCFullYear(),
      String(previous.getUTCMonth() + 1).padStart(2, "0"),
      String(previous.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }
  return streak;
}

function buildLocalDemoCalendar(from: string, to: string): CalendarResponse {
  const days: CalendarDay[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  let totalLearningMinutes = 0;
  let totalBookedMinutes = 0;
  let totalUtilisedBookedMinutes = 0;
  let totalNonBookedLearningMinutes = 0;

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = [
      cursor.getUTCFullYear(),
      String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      String(cursor.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const dayNumber = cursor.getUTCDate();
    const active = dayNumber % 4 !== 0 && dayNumber % 7 !== 0;
    const bookedMinutes = active && dayNumber % 3 !== 0 ? 120 : 0;
    const utilisedBookedMinutes = bookedMinutes ? Math.min(bookedMinutes, 65 + (dayNumber % 5) * 10) : 0;
    const nonBookedLearningMinutes = active ? 20 + (dayNumber % 4) * 15 : 0;
    const total = utilisedBookedMinutes + nonBookedLearningMinutes;
    const level = total === 0 ? 0 : total < 60 ? 1 : total < 100 ? 2 : total < 150 ? 3 : 4;
    totalLearningMinutes += total;
    totalBookedMinutes += bookedMinutes;
    totalUtilisedBookedMinutes += utilisedBookedMinutes;
    totalNonBookedLearningMinutes += nonBookedLearningMinutes;
    days.push({
      date,
      bookedMinutes,
      utilisedBookedMinutes,
      nonBookedLearningMinutes,
      additionalLearningMinutes: 0,
      totalLearningMinutes: total,
      actualLearningMinutes: total,
      bookedUtilizationPct: bookedMinutes ? Math.round((utilisedBookedMinutes / bookedMinutes) * 100) : 0,
      intensityLevel: level,
      bookings: bookedMinutes ? [{
        bookingId: "demo-" + date,
        courseId: "demo-course",
        courseVersionId: "demo-version",
        from: "18:00",
        to: "20:00",
        bookedMinutes,
        utilisedMinutes: utilisedBookedMinutes,
        utilizationPct: Math.round((utilisedBookedMinutes / bookedMinutes) * 100),
        status: "FULFILLED",
      }] : [],
      nonBookedCourses: nonBookedLearningMinutes ? [{
        courseId: "demo-course",
        courseVersionId: "demo-version",
        learningMinutes: nonBookedLearningMinutes,
      }] : [],
    });
  }

  return {
    from,
    to,
    days,
    summary: {
      totalBookedMinutes,
      totalUtilisedBookedMinutes,
      totalNonBookedLearningMinutes,
      totalLearningMinutes,
      totalActualLearningMinutes: totalLearningMinutes,
      activeDays: days.filter((day) => day.intensityLevel > 0).length,
      averageSlotUtilizationPct: totalBookedMinutes
        ? Math.round((totalUtilisedBookedMinutes / totalBookedMinutes) * 100)
        : null,
      currentStreak: 0,
    },
  };
}

export function LearningConsistencyCalendar({
  courseNames = {},
}: {
  courseNames?: Record<string, string>;
}) {
  const token = useAuthStore((state) => state.token);
  const localDemo = import.meta.env.DEV && import.meta.env.VITE_CALENDAR_DEMO === "true";
  const [months, setMonths] = useState(12);
  const [selectedDate, setSelectedDate] = useState("");
  const today = istDateKey(new Date());
  const from = useMemo(() => rangeStart(months, today), [months, today]);

  const {data, isLoading, isError, error, refetch, isFetching} = useQuery<CalendarResponse>({
    queryKey: ["learning-consistency-calendar", from, today],
    enabled: Boolean(token) || localDemo,
    queryFn: async () => {
      if (localDemo) return buildLocalDemoCalendar(from, today);
      const baseUrl = String(import.meta.env.VITE_BASE_URL ?? "").replace(/\/$/, "");
      const response = await fetch(
        baseUrl + "/slot-bookings/my/calendar?from=" + from + "&to=" + today,
        {
          method: "GET",
          credentials: "include",
          headers: token ? {Authorization: "Bearer " + token} : {},
        },
      );
      const payload = await response.json();
      if (!response.ok || payload?.success !== true || !payload?.data) {
        throw new Error(payload?.message || "Unable to load learning calendar (" + response.status + ").");
      }
      return payload.data as CalendarResponse;
    },
  });

  useEffect(() => {
    setSelectedDate(today);
  }, [today, months]);

  const dayMap = useMemo(
    () => new Map((data?.days ?? []).map((day) => [day.date, day])),
    [data],
  );
  const cells = useMemo(() => buildCells(from, today), [from, today]);
  const weeks = useMemo(() => {
    const result: Array<Array<{date: string; inRange: boolean}>> = [];
    for (let index = 0; index < cells.length; index += 7) {
      result.push(cells.slice(index, index + 7));
    }
    return result;
  }, [cells]);

  const selectedDay = selectedDate ? dayMap.get(selectedDate) : undefined;
  const summary = data?.summary;
  const streak = data ? dayStreak(data.days, today) : 0;

  const courseName = (courseId: string, courseVersionId: string) =>
    courseNames[courseId + ":" + courseVersionId] || "Course " + courseId.slice(-6);

  const tooltipFor = (date: string, day?: CalendarDay) => {
    if (!day || day.intensityLevel === 0) return dateLabel(date) + ": no learning activity";
    return [
      dateLabel(date),
      "Learning consistency: " + formatDuration(day.totalLearningMinutes),
      "Booked time utilised: " + formatDuration(day.utilisedBookedMinutes) + " / " + formatDuration(day.bookedMinutes),
      "Non-booked learning: " + formatDuration(day.nonBookedLearningMinutes),
    ].join("\n");
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold tracking-tight">Learning consistency</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily booked-time utilisation and learning activity across your courses
            {localDemo && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Sample data · local demo</span>}
          </p>
        </div>
        <div className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
          {[3, 6, 12].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMonths(value)}
              aria-pressed={months === value}
              className={"rounded-md px-3 py-1.5 text-xs font-medium transition " + (
                months === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value}M
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({length: 4}).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "The learning calendar could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : !token && !localDemo ? (
        <p className="text-sm text-muted-foreground">Sign in to view your learning consistency.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                <span className="text-xs">Learning time</span>
              </div>
              <p className="mt-2 text-xl font-semibold">{formatDuration(summary?.totalLearningMinutes ?? 0)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDuration(summary?.totalUtilisedBookedMinutes ?? 0)} booked · {formatDuration(summary?.totalNonBookedLearningMinutes ?? 0)} non-booked
              </p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Target className="h-4 w-4" />
                <span className="text-xs">Average slot utilisation</span>
              </div>
              <p className="mt-2 text-xl font-semibold">
                {summary?.averageSlotUtilizationPct == null ? "—" : summary.averageSlotUtilizationPct + "%"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Across booked learning time</p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                <span className="text-xs">Active days</span>
              </div>
              <p className="mt-2 text-xl font-semibold">{summary?.activeDays ?? 0}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Days with consistency activity</p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Flame className="h-4 w-4" />
                <span className="text-xs">Current streak</span>
              </div>
              <p className="mt-2 text-xl font-semibold">{streak} days</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Consecutive active days</p>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="min-w-max">
              <div className="mb-2 flex gap-2 pl-8">
                {weeks.map((week, index) => {
                  const firstOfMonth = week.find((cell) => cell.date.endsWith("-01"));
                  const label = firstOfMonth
                    ? new Intl.DateTimeFormat("en-IN", {month: "short", timeZone: "UTC"}).format(
                        new Date(firstOfMonth.date + "T00:00:00Z"),
                      )
                    : "";
                  return (
                    <div key={index} className="w-3 text-[10px] text-muted-foreground">
                      {label}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <div className="grid grid-rows-7 gap-1 text-[9px] text-muted-foreground">
                  <span />
                  <span>Mon</span>
                  <span />
                  <span>Wed</span>
                  <span />
                  <span>Fri</span>
                  <span />
                </div>
                <div
                  className="grid grid-flow-col grid-rows-7 gap-1"
                  style={{
                    gridTemplateRows: "repeat(7, 12px)",
                    gridAutoColumns: "12px",
                  }}
                >
                  {cells.map((cell) => {
                    const day = dayMap.get(cell.date);
                    const level = cell.inRange ? Math.max(0, Math.min(4, day?.intensityLevel ?? 0)) : 0;
                    const selected = selectedDate === cell.date;
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        disabled={!cell.inRange}
                        onClick={() => setSelectedDate(cell.date)}
                        aria-label={tooltipFor(cell.date, day)}
                        title={tooltipFor(cell.date, day)}
                        className={"h-3 w-3 rounded-[3px] border border-black/5 transition " +
                          (cell.inRange ? LEVEL_CLASSES[level] : "bg-transparent opacity-30") +
                          (selected ? " ring-2 ring-primary ring-offset-1" : "") +
                          (cell.inRange ? " cursor-pointer hover:ring-2 hover:ring-primary/50" : " cursor-default")}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
                <span>Less</span>
                {LEVEL_CLASSES.map((className, index) => (
                  <span key={index} className={"h-3 w-3 rounded-[3px] border border-black/5 " + className} />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {selectedDate ? dateLabel(selectedDate) : "Daily details"}
              </h3>
              <span className="text-xs text-muted-foreground">
                {selectedDay ? formatDuration(selectedDay.totalLearningMinutes) + " consistency time" : "No activity"}
              </span>
            </div>

            {!selectedDay || (
              selectedDay.bookings.length === 0 &&
              selectedDay.nonBookedCourses.length === 0 &&
              selectedDay.additionalLearningMinutes === 0
            ) ? (
              <p className="rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
                No learning activity recorded for this date.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDay.bookings.map((booking) => (
                  <div key={booking.bookingId} className="flex flex-col justify-between gap-2 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-medium">
                        {courseName(booking.courseId, booking.courseVersionId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Booked {booking.from}–{booking.to} · {formatDuration(booking.bookedMinutes)}
                      </p>
                    </div>
                    <div className="text-sm sm:text-right">
                      <p className="font-semibold">{booking.utilizationPct}% utilised</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(booking.utilisedMinutes)} used · {booking.status.toLowerCase()}
                      </p>
                    </div>
                  </div>
                ))}
                {selectedDay.nonBookedCourses.map((course) => (
                  <div
                    key={course.courseId + ":" + course.courseVersionId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"
                  >
                    <p className="text-sm font-medium">{courseName(course.courseId, course.courseVersionId)}</p>
                    <p className="text-sm font-semibold">{formatDuration(course.learningMinutes)}</p>
                  </div>
                ))}
                {selectedDay.additionalLearningMinutes > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(selectedDay.additionalLearningMinutes)} of additional study happened outside booked slots. It is shown separately from booked-slot utilisation.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {isFetching && !isLoading && (
        <p className="text-right text-[11px] text-muted-foreground">Refreshing calendar…</p>
      )}
    </section>
  );
}
