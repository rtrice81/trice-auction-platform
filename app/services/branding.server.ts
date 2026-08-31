const LOGO_SETTING_KEY = "site_logo";
const LOGO_OBJECT_PREFIX = "branding/site-logo/";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type SiteLogo = {
  objectKey: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  updatedAt: string;
};

export type BrandingResult =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

export async function getSiteLogo(db: D1Database): Promise<SiteLogo | null> {
  const setting = await db.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(LOGO_SETTING_KEY)
    .first<{ value: string }>();
  if (!setting) return null;

  try {
    const logo = JSON.parse(setting.value) as Partial<SiteLogo>;
    return isStoredLogo(logo) ? logo : null;
  } catch {
    return null;
  }
}

export async function saveSiteLogo(
  db: D1Database,
  bucket: R2Bucket,
  file: File,
): Promise<BrandingResult> {
  const validation = await validateLogoFile(file);
  if (!validation.ok) return validation;

  const existingLogo = await getSiteLogo(db);
  const objectKey = `${LOGO_OBJECT_PREFIX}${crypto.randomUUID()}.${validation.extension}`;
  const updatedAt = new Date().toISOString();

  await bucket.put(objectKey, file.stream(), {
    httpMetadata: { contentType: validation.contentType },
  });

  try {
    await db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(LOGO_SETTING_KEY, JSON.stringify({ objectKey, contentType: validation.contentType, updatedAt } satisfies SiteLogo)).run();
  } catch (error) {
    await bucket.delete(objectKey);
    throw error;
  }

  if (existingLogo) await bucket.delete(existingLogo.objectKey);
  return { ok: true, message: existingLogo ? "Logo replaced." : "Logo uploaded." };
}

export async function removeSiteLogo(db: D1Database, bucket: R2Bucket): Promise<BrandingResult> {
  const existingLogo = await getSiteLogo(db);
  if (!existingLogo) return { ok: false, errors: ["There is no uploaded logo to remove."] };

  // objectKey only originates from validated metadata; do not accept a key from a request.
  await bucket.delete(existingLogo.objectKey);
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(LOGO_SETTING_KEY).run();
  return { ok: true, message: "Logo removed. The text branding is now displayed." };
}

export async function validateLogoFile(file: File): Promise<
  | { ok: true; contentType: SiteLogo["contentType"]; extension: "png" | "jpg" | "webp" }
  | { ok: false; errors: string[] }
> {
  if (file.size === 0) return { ok: false, errors: ["Choose an image file to upload."] };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, errors: ["Logo files must be 2 MB or smaller."] };

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectImageType(header);
  if (!detected) return { ok: false, errors: ["Only PNG, JPEG, and WebP image files are supported."] };
  if (file.type !== detected.contentType) {
    return { ok: false, errors: ["The uploaded file's declared type does not match its image data."] };
  }

  return { ok: true, ...detected };
}

function detectImageType(bytes: Uint8Array): { contentType: SiteLogo["contentType"]; extension: "png" | "jpg" | "webp" } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

function isStoredLogo(logo: Partial<SiteLogo>): logo is SiteLogo {
  return typeof logo.objectKey === "string"
    && logo.objectKey.startsWith(LOGO_OBJECT_PREFIX)
    && typeof logo.contentType === "string"
    && ["image/png", "image/jpeg", "image/webp"].includes(logo.contentType)
    && typeof logo.updatedAt === "string";
}
