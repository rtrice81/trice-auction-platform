const FORM_COOKIE_PREFIX = "trice_public_form_";
const FORM_TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
const MIN_COMPLETION_MS = 2_000;

type Runtime = {
  AUTH_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
};

type ProtectedForm = "registration" | "public-booking";

type PublicFormCheck = { ok: true } | { ok: false; error: string };

export async function createPublicFormStart(request: Request, form: ProtectedForm, runtime: Runtime) {
  const issuedAt = Date.now();
  const nonce = randomNonce();
  const payload = `${form}.${issuedAt}.${nonce}`;
  const signature = await sign(payload, runtime.AUTH_SECRET);
  const token = `${payload}.${signature}`;
  return {
    token,
    headers: { "Set-Cookie": `${FORM_COOKIE_PREFIX}${form}=${token}; Path=/; Max-Age=1800; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` },
  };
}

export async function verifyPublicFormSubmission(input: {
  request: Request;
  formData: FormData;
  form: ProtectedForm;
  runtime: Runtime;
  db: D1Database;
  rateLimit: { maximumAttempts: number; windowSeconds: number };
}): Promise<PublicFormCheck> {
  const fail = (reason: string): PublicFormCheck => {
    console.warn("public-form-verification-failed", { form: input.form, reason });
    return { ok: false, error: "We couldn’t verify this submission. Please try again." };
  };

  // This value is intentionally not named as a security feature, and must stay empty.
  if (String(input.formData.get("companyWebsite") ?? "").trim()) return fail("decoy-filled");

  const submittedToken = String(input.formData.get("formStartToken") ?? "");
  const cookieToken = readCookie(input.request, `${FORM_COOKIE_PREFIX}${input.form}`);
  const issuedAt = await validFormStartToken(submittedToken, input.form, input.runtime);
  if (!issuedAt || !cookieToken || !constantTimeEqual(submittedToken, cookieToken)) return fail("invalid-start-token");
  if (Date.now() - issuedAt < MIN_COMPLETION_MS || Date.now() - issuedAt > FORM_TOKEN_MAX_AGE_MS) return fail("invalid-completion-time");

  const rateLimitAllowed = await consumeRateLimit(input.db, input.request, input.form, input.rateLimit);
  if (!rateLimitAllowed) return fail("rate-limit");

  const turnstileToken = String(input.formData.get("cf-turnstile-response") ?? "");
  if (!await verifyTurnstile(turnstileToken, input.request, input.runtime)) return fail("turnstile");
  return { ok: true };
}

export async function allowSensitiveUnauthenticatedAttempt(db: D1Database, request: Request, action: "login") {
  const allowed = await consumeRateLimit(db, request, action, { maximumAttempts: 15, windowSeconds: 600 });
  if (!allowed) console.warn("public-form-verification-failed", { form: action, reason: "rate-limit" });
  return allowed;
}

async function validFormStartToken(token: string, form: ProtectedForm, runtime: Runtime) {
  const match = /^([a-z-]+)\.(\d{13})\.([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match || match[1] !== form) return null;
  const payload = `${match[1]}.${match[2]}.${match[3]}`;
  if (!constantTimeEqual(await sign(payload, runtime.AUTH_SECRET), match[4])) return null;
  return Number(match[2]);
}

async function verifyTurnstile(token: string, request: Request, runtime: Runtime) {
  if (!token || !runtime.TURNSTILE_SECRET_KEY) {
    console.warn("turnstile-siteverify-failed", { success: false, "error-codes": [!token ? "missing-response-token" : "missing-secret"] });
    return false;
  }
  try {
    const body = new FormData();
    body.set("secret", runtime.TURNSTILE_SECRET_KEY);
    body.set("response", token);
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = await response.json() as { success?: boolean; "error-codes"?: string[]; hostname?: string; action?: string };
    if (!response.ok || result.success !== true) {
      console.warn("turnstile-siteverify-failed", { success: result.success === true, "error-codes": result["error-codes"] ?? [], hostname: result.hostname, action: result.action });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("turnstile-siteverify-request-failed", { success: false, "error-codes": [error instanceof Error ? error.name : "request-failed"] });
    return false;
  }
}

async function consumeRateLimit(db: D1Database, request: Request, form: ProtectedForm | "login", config: { maximumAttempts: number; windowSeconds: number }) {
  const window = Math.floor(Date.now() / (config.windowSeconds * 1_000));
  const clientKey = await sha256(`${form}:${request.headers.get("CF-Connecting-IP") || "unknown"}`);
  const rateKey = `${form}:${window}:${clientKey}`;
  const row = await db.prepare(
    `INSERT INTO public_form_rate_limits (rate_key, attempt_count)
     VALUES (?, 1)
     ON CONFLICT(rate_key) DO UPDATE SET attempt_count = attempt_count + 1
     RETURNING attempt_count AS attempts`,
  ).bind(rateKey).first<{ attempts: number }>();
  // Keep the small D1 table bounded without retaining client identifiers.
  if (Math.random() < 0.02) await db.prepare("DELETE FROM public_form_rate_limits WHERE created_at < datetime('now', '-2 days')").run();
  return (row?.attempts ?? config.maximumAttempts + 1) <= config.maximumAttempts;
}

function readCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

async function sign(value: string, secret?: string) {
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function randomNonce() { const bytes = new Uint8Array(18); crypto.getRandomValues(bytes); return toBase64Url(bytes); }
function toBase64Url(bytes: Uint8Array) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index); return mismatch === 0; }
