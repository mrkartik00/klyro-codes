// Business-day scheduling in a lead's timezone. Weekends skipped; the send
// window is applied by the send-time claim, this only advances the date.

const WEEKEND = new Set([0, 6]); // Sun, Sat

/** Get the weekday (0-6) for a Date in a given IANA timezone. */
function weekdayInTz(date, timeZone) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
}

/** Add N business days to `from`, in the given timezone. */
export function addBusinessDays(from, days, timeZone = 'UTC') {
  const d = new Date(from);
  let added = 0;
  if (days <= 0) return d;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!WEEKEND.has(weekdayInTz(d, timeZone))) added += 1;
  }
  return d;
}

/** Is `date` within [startHour, endHour) on a business day in the timezone? */
export function isWithinSendWindow(date, { startHour, endHour, businessDaysOnly }, timeZone = 'UTC') {
  const wd = weekdayInTz(date, timeZone);
  if (businessDaysOnly && WEEKEND.has(wd)) return false;
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
  );
  return hour >= startHour && hour < endHour;
}
