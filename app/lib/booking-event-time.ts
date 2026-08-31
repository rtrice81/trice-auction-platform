export const OPERATIONAL_TIMEZONE = "America/New_York";

type TimeStorageVersion = number | null | undefined;

export function bookingEventInstant(value: string, timezone = OPERATIONAL_TIMEZONE, storageVersion: TimeStorageVersion = 2) {
  if (storageVersion === 1) return zonedDateTimeToUtc(legacyLocalValue(value), timezone);
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

export function zonedDateTimeToUtc(value: string, timezone = OPERATIONAL_TIMEZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const localEpoch = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let instant = localEpoch;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const projected = Date.UTC(...dateParts(new Date(instant), timezone));
    const next = localEpoch - (projected - instant);
    if (next === instant) break;
    instant = next;
  }
  const date = new Date(instant);
  const expected = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)];
  return dateParts(date, timezone).every((part, index) => part === expected[index]) ? date : null;
}

export function bookingEventInputValue(value: string | null | undefined, timezone = OPERATIONAL_TIMEZONE, storageVersion: TimeStorageVersion = 2) {
  const instant = value ? bookingEventInstant(value, timezone, storageVersion) : null;
  if (!instant) return "";
  const [year, month, day, hour, minute] = formatParts(instant, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatBookingEventTime(value: string, timezone = OPERATIONAL_TIMEZONE, storageVersion: TimeStorageVersion = 2) {
  const instant = bookingEventInstant(value, timezone, storageVersion);
  return instant ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(instant) : "Invalid date";
}

function legacyLocalValue(value: string) { return value.replace(/Z$/, "").replace(/\.\d+$/, ""); }
function dateParts(date: Date, timezone: string) { const parts = formatParts(date, timezone); return [parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]] as [number, number, number, number, number, number]; }
function formatParts(date: Date, timezone: string) { const values = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date); const byType = new Map<string, string>(values.map((part) => [part.type, part.value])); return ["year", "month", "day", "hour", "minute", "second"].map((type) => Number(byType.get(type))) as [number, number, number, number, number, number]; }
