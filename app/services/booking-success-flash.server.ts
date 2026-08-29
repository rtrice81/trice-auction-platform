export type BookingSuccessFlash = {
  appointmentDate: string;
  appointmentTime: string | null;
  loadType: string;
};

const COOKIE_NAME = "trice_booking_success";

export async function createBookingSuccessFlash(db: D1Database, userId: number, appointmentId: number) {
  const token = randomToken();
  await db.batch([
    db.prepare("DELETE FROM booking_success_flashes WHERE expires_at <= CURRENT_TIMESTAMP"),
    db.prepare(
      `INSERT INTO booking_success_flashes (token, user_id, appointment_id, expires_at)
       VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
    ).bind(token, userId, appointmentId),
  ]);
  return token;
}

export async function consumeBookingSuccessFlash(db: D1Database, userId: number, token: string | null): Promise<BookingSuccessFlash | null> {
  if (!token) return null;
  const flash = await db.prepare(
    `SELECT appointment.appointment_date AS appointmentDate, appointment.appointment_time AS appointmentTime,
      type.name AS loadType
     FROM booking_success_flashes flash
     JOIN appointments appointment ON appointment.id = flash.appointment_id
     JOIN dropoff_types type ON type.id = appointment.dropoff_type_id
     WHERE flash.token = ? AND flash.user_id = ? AND flash.expires_at > CURRENT_TIMESTAMP`,
  ).bind(token, userId).first<BookingSuccessFlash>();
  await db.prepare("DELETE FROM booking_success_flashes WHERE token = ?").bind(token).run();
  return flash;
}

export function getBookingSuccessFlashToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return value && /^[A-Za-z0-9_-]{40,}$/.test(value) ? value : null;
}

export function bookingSuccessFlashCookie(token: string, request: Request) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function clearBookingSuccessFlashCookie(request: Request) {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
