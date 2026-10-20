export type EnvironmentPolicy = {
  APP_ENV?: string;
  BETTER_AUTH_URL?: string;
  APP_BASE_URL?: string;
  NOTIFICATION_MODE?: string;
  TURNSTILE_MODE?: string;
};

export const STAGING_ORIGIN = "https://staging-consign.bidtrice.com";

export function assertStagingConfiguration(env: EnvironmentPolicy, request?: Request) {
  if (env.APP_ENV !== "staging") return;
  if (env.BETTER_AUTH_URL !== STAGING_ORIGIN || env.APP_BASE_URL !== STAGING_ORIGIN || env.NOTIFICATION_MODE !== "log") {
    throw new Error("Staging requires isolated auth/link URLs and log-only notifications.");
  }
  if (request && new URL(request.url).origin !== STAGING_ORIGIN) {
    throw new Error("Staging requests must use the staging origin.");
  }
}

export function notificationsAreSuppressed(env: EnvironmentPolicy) {
  // Staging can never enable external delivery, even if its mode is misconfigured.
  return env.APP_ENV === "staging" || env.NOTIFICATION_MODE === "log";
}

export function stagingAuthOptions(env: EnvironmentPolicy) {
  if (env.APP_ENV !== "staging") return undefined;
  if (env.BETTER_AUTH_URL !== STAGING_ORIGIN) throw new Error("Invalid staging Better Auth URL.");
  return {
    trustedOrigins: [STAGING_ORIGIN],
    advanced: { useSecureCookies: true, cookiePrefix: "trice-staging", crossSubDomainCookies: { enabled: false } },
  };
}
