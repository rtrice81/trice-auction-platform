export type PendingBooking = {
  appointmentDate: string;
  dropoffTypeId: number;
  description: string;
  allocations: Array<{ itemAreaId: number; percentage: number }>;
};

const COOKIE_NAME = "trice_pending_booking";

export function pendingBookingFromForm(form: FormData): PendingBooking {
  return {
    appointmentDate: String(form.get("appointmentDate") ?? ""),
    dropoffTypeId: Number(form.get("dropoffTypeId")),
    description: String(form.get("description") ?? "").trim(),
    allocations: Array.from(form.entries())
      .filter(([name]) => name.startsWith("allocation-"))
      .map(([name, value]) => ({ itemAreaId: Number(name.slice("allocation-".length)), percentage: Number(value) })),
  };
}

export async function createPendingBooking(db: D1Database, booking: PendingBooking, existingToken: string | null = null) {
  if (existingToken) {
    const updated = await db.prepare(
      `UPDATE pending_booking_requests
       SET booking_json = ?, expires_at = datetime('now', '+2 hours')
       WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
    ).bind(JSON.stringify(booking), existingToken).run();
    if (updated.meta.changes === 1) return existingToken;
  }

  const token = randomToken();
  await db.batch([
    db.prepare("DELETE FROM pending_booking_requests WHERE expires_at <= CURRENT_TIMESTAMP"),
    db.prepare(
      `INSERT INTO pending_booking_requests (token, booking_json, expires_at)
       VALUES (?, ?, datetime('now', '+2 hours'))`,
    ).bind(token, JSON.stringify(booking)),
  ]);
  return token;
}

export async function getPendingBooking(db: D1Database, token: string | null): Promise<PendingBooking | null> {
  if (!token) return null;
  const row = await db.prepare(
    "SELECT booking_json AS bookingJson FROM pending_booking_requests WHERE token = ? AND expires_at > CURRENT_TIMESTAMP",
  ).bind(token).first<{ bookingJson: string }>();
  return row ? parsePendingBooking(row.bookingJson) : null;
}

export async function deletePendingBooking(db: D1Database, token: string | null) {
  if (token) await db.prepare("DELETE FROM pending_booking_requests WHERE token = ?").bind(token).run();
}

export function getPendingBookingToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return value && /^[A-Za-z0-9_-]{40,}$/.test(value) ? value : null;
}

export function pendingBookingCookie(token: string, request: Request) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=7200; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function clearPendingBookingCookie(request: Request) {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parsePendingBooking(value: string): PendingBooking | null {
  try {
    const booking = JSON.parse(value) as Partial<PendingBooking>;
    if (typeof booking.appointmentDate !== "string" || typeof booking.dropoffTypeId !== "number" || typeof booking.description !== "string" || !Array.isArray(booking.allocations)) return null;
    if (!booking.allocations.every((allocation) => allocation && typeof allocation.itemAreaId === "number" && typeof allocation.percentage === "number")) return null;
    return booking as PendingBooking;
  } catch {
    return null;
  }
}
