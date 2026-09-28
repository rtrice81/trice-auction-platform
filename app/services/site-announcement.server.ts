const ENABLED_SETTING_KEY = "site_announcement_enabled";
const TITLE_SETTING_KEY = "site_announcement_title";
const MESSAGE_SETTING_KEY = "site_announcement_message";
const DEFAULT_TITLE = "Important Notice";
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1_000;

export type AnnouncementMark = { type: "bold" | "italic" | "underline" } | { type: "link"; attrs: { href: string } };
export type AnnouncementNode = {
  type: "doc" | "paragraph" | "heading" | "bulletList" | "orderedList" | "listItem" | "text" | "hardBreak";
  attrs?: { level?: 2 | 3; textAlign?: "left" | "center" | "right" };
  marks?: AnnouncementMark[];
  text?: string;
  content?: AnnouncementNode[];
};

export type SiteAnnouncementSettings = { enabled: boolean; title: string; content: AnnouncementNode | null };
export type SiteAnnouncementResult = { ok: true; message: string } | { ok: false; errors: string[] };

export async function getSiteAnnouncementSettings(db: D1Database): Promise<SiteAnnouncementSettings> {
  const { results } = await db.prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?)")
    .bind(ENABLED_SETTING_KEY, TITLE_SETTING_KEY, MESSAGE_SETTING_KEY).all<{ key: string; value: string }>();
  const settings = new Map(results.map((setting) => [setting.key, setting.value]));
  return { enabled: settings.get(ENABLED_SETTING_KEY) === "1", title: settings.get(TITLE_SETTING_KEY)?.trim() ?? "", content: parseStoredContent(settings.get(MESSAGE_SETTING_KEY) ?? "") };
}

export async function getVisibleSiteAnnouncement(db: D1Database): Promise<SiteAnnouncementSettings | null> {
  const announcement = await getSiteAnnouncementSettings(db);
  if (!announcement.enabled || !hasAnnouncementText(announcement.content)) return null;
  return { ...announcement, title: announcement.title || DEFAULT_TITLE };
}

export async function saveSiteAnnouncement(db: D1Database, input: { enabled: boolean; title: string; message: string }): Promise<SiteAnnouncementResult> {
  const title = input.title.trim();
  const content = parseStoredContent(input.message);
  const errors: string[] = [];
  if (title.length > MAX_TITLE_LENGTH) errors.push(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  if (announcementTextLength(content) > MAX_MESSAGE_LENGTH) errors.push(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  if (errors.length) return { ok: false, errors };
  await db.batch([
    saveSetting(db, ENABLED_SETTING_KEY, input.enabled ? "1" : "0"),
    saveSetting(db, TITLE_SETTING_KEY, title),
    saveSetting(db, MESSAGE_SETTING_KEY, content ? JSON.stringify(content) : ""),
  ]);
  return { ok: true, message: "Site announcement saved." };
}

export function parseStoredContent(value: string): AnnouncementNode | null {
  const source = value.trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    if (isRecord(parsed) && parsed.type === "doc") return sanitizeDocument(parsed);
  } catch {
    // Plain-text announcements created before the rich-text editor remain supported.
  }
  return plainTextDocument(value);
}

function sanitizeDocument(value: unknown): AnnouncementNode | null {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) return null;
  const content = value.content.map(sanitizeNode).filter((node): node is AnnouncementNode => node !== null);
  const document: AnnouncementNode = { type: "doc", content };
  return hasAnnouncementText(document) ? document : null;
}

function sanitizeNode(value: unknown): AnnouncementNode | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "text") return typeof value.text === "string" ? { type: "text", text: value.text, marks: sanitizeMarks(value.marks) } : null;
  if (value.type === "hardBreak") return { type: "hardBreak" };
  if (!["paragraph", "heading", "bulletList", "orderedList", "listItem"].includes(value.type) || !Array.isArray(value.content)) return null;
  const content = value.content.map(sanitizeNode).filter((node): node is AnnouncementNode => node !== null);
  if (!content.length) return null;
  if (value.type === "heading") return { type: "heading", attrs: { level: isRecord(value.attrs) && (value.attrs.level === 2 || value.attrs.level === 3) ? value.attrs.level : 2, textAlign: textAlign(value.attrs) }, content };
  if (value.type === "paragraph") return { type: "paragraph", attrs: { textAlign: textAlign(value.attrs) }, content };
  return { type: value.type as "bulletList" | "orderedList" | "listItem", content };
}

function sanitizeMarks(value: unknown): AnnouncementMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks: AnnouncementMark[] = [];
  for (const mark of value) {
    if (!isRecord(mark)) continue;
    if (mark.type === "bold" || mark.type === "italic" || mark.type === "underline") marks.push({ type: mark.type });
    if (mark.type === "link" && isRecord(mark.attrs) && typeof mark.attrs.href === "string" && safeHttpUrl(mark.attrs.href)) marks.push({ type: "link", attrs: { href: mark.attrs.href } });
  }
  return marks.length ? marks : undefined;
}

function textAlign(attrs: unknown): "left" | "center" | "right" | undefined {
  if (!isRecord(attrs)) return undefined;
  return attrs.textAlign === "left" || attrs.textAlign === "center" || attrs.textAlign === "right" ? attrs.textAlign : undefined;
}

export function safeHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

function plainTextDocument(value: string): AnnouncementNode | null {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? { type: "doc", content: lines.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) } : null;
}

function hasAnnouncementText(value: AnnouncementNode | null) { return announcementTextLength(value) > 0; }
function announcementTextLength(value: AnnouncementNode | null): number { return !value ? 0 : value.type === "text" ? value.text?.trim().length ?? 0 : value.content?.reduce((total, node) => total + announcementTextLength(node), 0) ?? 0; }
function saveSetting(db: D1Database, key: string, value: string) { return db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
