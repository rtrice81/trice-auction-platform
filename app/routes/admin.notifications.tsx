import { env } from "cloudflare:workers";
import { data, Form } from "react-router";
import type { Route } from "./+types/admin.notifications";
import { requireRole } from "../services/auth.server";
import { getNotificationProviderStatuses, getNotificationSettings, saveNotificationSettings } from "../services/notification.server";
import { PageIntro, PageShell, Notice } from "../components/design-system";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
const providerEnvironment = env as unknown as { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string; TELNYX_API_KEY?: string; TELNYX_FROM_NUMBER?: string; TELNYX_WEBHOOK_PUBLIC_KEY?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const settings = await getNotificationSettings(env.trice_auction_db);
  // Status contains only safe booleans and descriptions; secrets never leave this loader.
  return { settings, providers: getNotificationProviderStatuses(settings, providerEnvironment) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const minutes = (name: string) => Math.max(0, Math.floor(Number(form.get(name)) || 0));
  const emailProvider = String(form.get("emailProvider") || "");
  const smsProvider = String(form.get("smsProvider") || "");
  const senderAddress = String(form.get("emailSenderAddress") || "").trim();
  const replyTo = String(form.get("emailReplyTo") || "").trim();
  const senderNumber = String(form.get("smsSenderNumber") || "").trim();
  if (emailProvider !== "resend" || smsProvider !== "telnyx") return data({ ok: false as const, error: "Only the currently supported Resend and Telnyx providers may be selected." }, { status: 400 });
  if (senderAddress && !/^\S+@\S+\.\S+$/.test(senderAddress)) return data({ ok: false as const, error: "Enter a valid sender email address." }, { status: 400 });
  if (replyTo && !/^\S+@\S+\.\S+$/.test(replyTo)) return data({ ok: false as const, error: "Enter a valid reply-to email address." }, { status: 400 });
  if (senderNumber && senderNumber.replace(/\D/g, "").length < 10) return data({ ok: false as const, error: "Enter a valid sender phone number." }, { status: 400 });
  await saveNotificationSettings(env.trice_auction_db, {
    "notifications.first_reminder_enabled": form.get("firstEnabled") === "on" ? "1" : "0", "notifications.first_reminder_offset_minutes": String(minutes("firstOffset")),
    "notifications.second_reminder_enabled": form.get("secondEnabled") === "on" ? "1" : "0", "notifications.second_reminder_offset_minutes": String(minutes("secondOffset")),
    "notifications.email_enabled": form.get("emailEnabled") === "on" ? "1" : "0", "notifications.sms_enabled": form.get("smsEnabled") === "on" ? "1" : "0",
    "notifications.email_provider": emailProvider, "notifications.email_sender_name": String(form.get("emailSenderName") || "").trim(), "notifications.email_sender_address": senderAddress, "notifications.email_reply_to": replyTo,
    "notifications.sms_provider": smsProvider, "notifications.sms_sender_number": senderNumber, "notifications.sms_messaging_profile_id": String(form.get("smsMessagingProfileId") || "").trim(),
  });
  return data({ ok: true as const });
}

export default function AdminNotifications({ loaderData, actionData }: Route.ComponentProps) {
  const { settings: s, providers } = loaderData;
  return <PageShell><div className="max-w-3xl"><PageIntro eyebrow="Trice Auctions · Administration" title="Notifications">Configure transactional appointment channels and reminder timing.</PageIntro>
    <Notice variant="warning">API credentials are stored securely in Cloudflare and are not displayed here.</Notice>
    {actionData?.ok ? <Notice variant="success">Notification settings saved.</Notice> : null}{actionData && !actionData.ok ? <Notice variant="error">{actionData.error}</Notice> : null}
    <Form method="post" className="mt-6 space-y-6 rounded-xl border bg-white p-6">
      <ProviderCard title="Email Provider" status={providers.email.status}><label className="ta-field">Selected provider<select name="emailProvider" defaultValue={s["notifications.email_provider"]}><option value="resend">Resend</option></select></label><Field label="Sender display name" name="emailSenderName" value={s["notifications.email_sender_name"]}/><Field label="Sender email address" name="emailSenderAddress" type="email" value={s["notifications.email_sender_address"] || providers.email.senderAddress || ""}/><Field label="Reply-to address (optional)" name="emailReplyTo" type="email" value={s["notifications.email_reply_to"]}/><MissingSecret status={providers.email.status} provider="Resend" secret="RESEND_API_KEY"/></ProviderCard>
      <ProviderCard title="SMS Provider" status={providers.sms.status}><label className="ta-field">Selected provider<select name="smsProvider" defaultValue={s["notifications.sms_provider"]}><option value="telnyx">Telnyx</option></select></label><Field label="Sender / from phone number" name="smsSenderNumber" type="tel" value={s["notifications.sms_sender_number"] || providers.sms.senderNumber || ""}/><Field label="Messaging profile ID (optional)" name="smsMessagingProfileId" value={s["notifications.sms_messaging_profile_id"]}/><p className="text-sm text-stone-600">Inbound webhook: <code>/webhooks/telnyx/sms</code> · Signature validation: <strong>{providers.sms.inboundWebhook.signatureValidationConfigured ? "Configured" : "Not Configured"}</strong></p><MissingSecret status={providers.sms.status} provider="Telnyx" secret="TELNYX_API_KEY"/>{!providers.sms.inboundWebhook.signatureValidationConfigured ? <p className="text-sm text-amber-800">Set the <code>TELNYX_WEBHOOK_PUBLIC_KEY</code> Cloudflare secret before enabling inbound SMS keywords.</p> : null}</ProviderCard>
      <fieldset className="border-t pt-6"><legend className="text-xl font-bold">Customer reminders</legend><Reminder name="first" label="First reminder" enabled={s["notifications.first_reminder_enabled"] === "1"} offset={s["notifications.first_reminder_offset_minutes"]}/><Reminder name="second" label="Second reminder" enabled={s["notifications.second_reminder_enabled"] === "1"} offset={s["notifications.second_reminder_offset_minutes"]}/><p className="mt-3 text-sm text-stone-600">Offsets are minutes before the appointment (7 days = 10080, 48 hours = 2880, day before = 1440).</p></fieldset>
      <fieldset className="border-t pt-6"><legend className="text-xl font-bold">Channels</legend><label className="mt-4 flex gap-3"><input name="emailEnabled" type="checkbox" defaultChecked={s["notifications.email_enabled"] === "1"}/><span>Email globally enabled</span></label><label className="mt-3 flex gap-3"><input name="smsEnabled" type="checkbox" defaultChecked={s["notifications.sms_enabled"] === "1"}/><span>SMS globally enabled</span></label></fieldset>
      <button className="ta-button ta-button-primary">Save notification settings</button>
    </Form>
  </div></PageShell>;
}

function ProviderCard({ title, status, children }: { title: string; status: string; children: React.ReactNode }) { const configured = status === "Configured"; return <section className="rounded-xl border border-stone-200 p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{title}</h2><span className={configured ? "rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900" : "rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900"}>{status}</span></div><div className="mt-5 grid gap-4">{children}</div></section>; }
function MissingSecret({ status, provider, secret }: { status: string; provider: string; secret: string }) { return status === "Missing API Key" ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{provider} is not configured. Set the <code>{secret}</code> Cloudflare secret to enable delivery: <code>npx wrangler secret put {secret}</code></p> : null; }
function Field({ label, name, value, type = "text" }: { label: string; name: string; value: string; type?: string }) { return <label className="ta-field">{label}<input name={name} type={type} defaultValue={value} /></label>; }
function Reminder({ name, label, enabled, offset }: { name: "first" | "second"; label: string; enabled: boolean; offset: string }) { return <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem]"><label className="flex gap-3"><input name={`${name}Enabled`} type="checkbox" defaultChecked={enabled}/><span>{label} enabled</span></label><label className="text-sm font-semibold">Minutes before appointment<input name={`${name}Offset`} type="number" min="0" defaultValue={offset} className="mt-1 block w-full rounded border p-2 font-normal"/></label></div>; }
