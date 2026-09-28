const ENABLED_SETTING_KEY = "site_announcement_enabled";
const TITLE_SETTING_KEY = "site_announcement_title";
const MESSAGE_SETTING_KEY = "site_announcement_message";
const DEFAULT_TITLE = "Important Notice";
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1_000;

export type SiteAnnouncementSettings = {
  enabled: boolean;
  title: string;
  message: string;
};

export type SiteAnnouncementResult =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

export async function getSiteAnnouncementSettings(db: D1Database): Promise<SiteAnnouncementSettings> {
  const { results } = await db.prepare(
    "SELECT key, value FROM settings WHERE key IN (?, ?, ?)",
  ).bind(ENABLED_SETTING_KEY, TITLE_SETTING_KEY, MESSAGE_SETTING_KEY).all<{ key: string; value: string }>();
  const settings = new Map(results.map((setting) => [setting.key, setting.value]));
  return {
    enabled: settings.get(ENABLED_SETTING_KEY) === "1",
    title: settings.get(TITLE_SETTING_KEY)?.trim() ?? "",
    message: settings.get(MESSAGE_SETTING_KEY)?.trim() ?? "",
  };
}

export async function getVisibleSiteAnnouncement(db: D1Database): Promise<SiteAnnouncementSettings | null> {
  const announcement = await getSiteAnnouncementSettings(db);
  if (!announcement.enabled || !announcement.message) return null;
  return { ...announcement, title: announcement.title || DEFAULT_TITLE };
}

export async function saveSiteAnnouncement(
  db: D1Database,
  input: { enabled: boolean; title: string; message: string },
): Promise<SiteAnnouncementResult> {
  const title = input.title.trim();
  const message = input.message.trim();
  const errors: string[] = [];
  if (title.length > MAX_TITLE_LENGTH) errors.push(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  if (message.length > MAX_MESSAGE_LENGTH) errors.push(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  if (errors.length) return { ok: false, errors };

  await db.batch([
    saveSetting(db, ENABLED_SETTING_KEY, input.enabled ? "1" : "0"),
    saveSetting(db, TITLE_SETTING_KEY, title),
    saveSetting(db, MESSAGE_SETTING_KEY, message),
  ]);
  return { ok: true, message: "Site announcement saved." };
}

function saveSetting(db: D1Database, key: string, value: string) {
  return db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).bind(key, value);
}
