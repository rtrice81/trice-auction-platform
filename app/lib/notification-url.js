/**
 * Notification links are absolute URLs. Scheduled delivery has no request URL,
 * so it requires APP_BASE_URL or the application's existing BETTER_AUTH_URL.
 * @param {{ APP_BASE_URL?: string; BETTER_AUTH_URL?: string }} env
 * @param {string} [requestUrl] Fallback for request-based previews/local use.
 */
export function getNotificationBaseUrl(env, requestUrl) {
  const value = env.APP_BASE_URL?.trim() || env.BETTER_AUTH_URL?.trim() || requestUrl;
  try {
    const url = new URL(value || "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    throw new Error("Configure APP_BASE_URL or BETTER_AUTH_URL with a valid HTTP(S) application URL for notification links.");
  }
}

/**
 * @param {number | string} appointmentId
 * @param {{ APP_BASE_URL?: string; BETTER_AUTH_URL?: string }} env
 * @param {string} [requestUrl]
 */
export function getAppointmentUrl(appointmentId, env, requestUrl) {
  return new URL(`/my-appointments/${encodeURIComponent(String(appointmentId))}`, getNotificationBaseUrl(env, requestUrl)).href;
}
