# Learning Consistency Calendar

The student Learning Analytics page includes a contribution-style daily calendar.

## Data sources

The feature reuses the existing MongoDB slotBookings and watchTime collections. It does not add a tracking SDK, a new session collection, or new environment variables.

- Courses with active time-slot booking use the percentage of reserved slot time covered by genuine watch-time sessions.
- Courses without active time-slot booking use actual watch-time duration.
- Synthetic bulk watch-time records are excluded.
- All booking dates and calendar-day boundaries use the platform's existing Asia/Kolkata (IST) convention.
- Time spent in a booking-enabled course outside its reserved windows is reported separately and does not inflate booked-slot utilisation.

## API

GET /slot-bookings/my/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD

The authenticated student is taken from the existing request identity; a client cannot request another student's data. The date range is inclusive and limited to 370 days.

The response contains daily totals, booking-level utilisation details, non-booked course activity, intensity levels, and summary metrics.

## Intensity levels

For booked courses, intensity follows the combined booked-time utilisation percentage: below 50% is level 1, 50–74% is level 2, 75–99% is level 3, and 100% is level 4. Zero utilisation is level 0.

For courses that do not require slot booking, intensity is based on actual learning time: under 30 minutes is level 1, 30–59 minutes is level 2, 60–119 minutes is level 3, and 120 minutes or more is level 4. A day's calendar level is the higher of its booked and non-booked levels.

## Verification

From the repository root:

- pnpm --filter backend build
- pnpm --filter backend exec vitest run src/modules/setting/tests/learningCalendar.test.ts
- pnpm --filter frontend typecheck
- pnpm --filter frontend build

No real .env values should be committed. Use the existing backend/.example.env and frontend environment setup documented by VIBE.
