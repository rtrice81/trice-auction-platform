import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin.announcement";
import { requireRole } from "../services/auth.server";
import { getSiteAnnouncementSettings, saveSiteAnnouncement, type SiteAnnouncementResult } from "../services/site-announcement.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Site Announcement | Trice Auctions" }, { name: "description", content: "Manage the customer-facing site announcement." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  return getSiteAnnouncementSettings(env.trice_auction_db);
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  if (form.get("intent") !== "save") return data<SiteAnnouncementResult>({ ok: false, errors: ["Unknown announcement action."] }, { status: 400 });
  const result = await saveSiteAnnouncement(env.trice_auction_db, {
    enabled: form.get("enabled") === "on",
    title: String(form.get("title") ?? ""),
    message: String(form.get("message") ?? ""),
  });
  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminAnnouncement({ loaderData, actionData }: Route.ComponentProps) {
  return <main className="ta-page ta-admin-page"><div className="max-w-4xl"><header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-8"><div><p className="mb-3 text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · System</p><h1 className="text-4xl font-bold tracking-tight text-stone-950">Site Announcement</h1><p className="mt-3 max-w-2xl text-stone-600">Display an important plain-text message across customer-facing pages.</p></div><Link to="/" className="text-sm font-semibold text-amber-800 hover:text-amber-950">View site →</Link></header>
    {actionData?.ok ? <Notice variant="success">{actionData.message}</Notice> : null}{actionData && !actionData.ok ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}
    <Form method="post" className="rounded-xl border border-[#dfe1e4] bg-white p-6 shadow-sm"><input type="hidden" name="intent" value="save"/><h2 className="text-xl font-bold text-[#25272b]">Site Announcement</h2><label className="mt-5 flex items-center gap-3 text-sm font-semibold text-[#35383d]"><input type="checkbox" name="enabled" defaultChecked={loaderData.enabled} className="size-4 accent-[#9d302f]"/>Show announcement banner</label><label className="ta-field mt-5">Title <span className="text-xs font-normal text-[#666a70]">Optional</span><input name="title" maxLength={120} defaultValue={loaderData.title} placeholder="Important Notice"/></label><label className="ta-field mt-5">Message<textarea name="message" maxLength={1000} rows={5} defaultValue={loaderData.message} placeholder="Enter the message to show across the customer site."/></label><p className="mt-2 text-xs leading-5 text-[#666a70]">The announcement is shown only when enabled and the message is not blank. It is displayed as plain text.</p><button className="ta-button ta-button-primary mt-6">Save Announcement</button></Form>
  </div></main>;
}

function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) {
  const classes = variant === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950";
  return <div role={variant === "success" ? "status" : "alert"} className={`mb-6 rounded-lg border px-5 py-4 text-sm ${classes}`}>{children}</div>;
}
