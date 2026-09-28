import type { SiteAnnouncementSettings } from "../services/site-announcement.server";

export function SiteAnnouncement({ announcement }: { announcement: SiteAnnouncementSettings | null }) {
  if (!announcement) return null;
  return <aside className="ta-site-announcement" role="status" aria-label="Site announcement"><div><p className="ta-site-announcement-title">{announcement.title}</p><p className="ta-site-announcement-message">{announcement.message}</p></div></aside>;
}
