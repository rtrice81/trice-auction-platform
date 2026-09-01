import { env } from "cloudflare:workers";
import { data, Form } from "react-router";
import type { Route } from "./+types/admin.notification-recipients";
import { requireRole } from "../services/auth.server";
import { deleteInternalAppointmentRecipient, listInternalAppointmentRecipients, saveInternalAppointmentRecipient } from "../services/internal-appointment-notifications.server";
import { Notice, PageIntro, PageShell } from "../components/design-system";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  return { recipients: await listInternalAppointmentRecipients(env.trice_auction_db) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const intent = String(form.get("intent") || "save");
  if (intent === "delete") {
    const result = await deleteInternalAppointmentRecipient(env.trice_auction_db, Number(form.get("id")));
    return data(result.ok ? { ok: true as const, message: "Internal recipient deleted." } : result, { status: result.ok ? 200 : 400 });
  }
  const result = await saveInternalAppointmentRecipient(env.trice_auction_db, {
    id: Number(form.get("id")) || undefined,
    label: String(form.get("label") || ""), email: String(form.get("email") || ""),
    active: form.get("active") === "on" ? 1 : 0,
    receiveCreated: form.get("receiveCreated") === "on" ? 1 : 0,
    receiveUpdated: form.get("receiveUpdated") === "on" ? 1 : 0,
    receiveCancelled: form.get("receiveCancelled") === "on" ? 1 : 0,
  });
  return data(result.ok ? { ok: true as const, message: "Internal recipient saved." } : result, { status: result.ok ? 200 : 400 });
}

export default function InternalAppointmentRecipients({ loaderData, actionData }: Route.ComponentProps) {
  return <PageShell><div className="max-w-4xl"><PageIntro eyebrow="Trice Auctions · Administration" title="Internal Appointment Recipients">Choose the internal mailboxes that receive appointment activity. These recipients are separate from customer notifications.</PageIntro>
    {actionData && actionData.ok ? <Notice variant="success">{actionData.message}</Notice> : null}{actionData && !actionData.ok ? <Notice variant="error">{actionData.error}</Notice> : null}
    <RecipientForm title="Add recipient" />
    <section className="mt-6 space-y-5">{loaderData.recipients.map((recipient) => <div key={recipient.id} className="rounded-xl border border-stone-200 bg-white p-6"><RecipientForm title={`${recipient.label} (${recipient.active ? "Active" : "Inactive"})`} recipient={recipient}/><Form method="post" className="mt-3"><input type="hidden" name="intent" value="delete"/><input type="hidden" name="id" value={recipient.id}/><button className="text-sm font-semibold text-red-700 underline">Delete recipient</button></Form></div>)}{!loaderData.recipients.length ? <p className="mt-6 text-sm text-stone-600">No internal recipients configured yet.</p> : null}</section>
  </div></PageShell>;
}

function RecipientForm({ title, recipient }: { title: string; recipient?: { id: number; label: string; email: string; active: number; receiveCreated: number; receiveUpdated: number; receiveCancelled: number } }) {
  return <Form method="post" className="grid gap-4"><input type="hidden" name="intent" value="save"/>{recipient ? <input type="hidden" name="id" value={recipient.id}/> : null}<h2 className="text-xl font-bold text-[#9d302f]">{title}</h2><div className="grid gap-4 sm:grid-cols-2"><label className="ta-field">Name / label<input required name="label" defaultValue={recipient?.label || ""} placeholder="Main Office"/></label><label className="ta-field">Email address<input required type="email" name="email" defaultValue={recipient?.email || ""} placeholder="office@example.com"/></label></div><div className="flex flex-wrap gap-5 text-sm"><label><input className="mr-2" type="checkbox" name="active" defaultChecked={recipient ? recipient.active === 1 : true}/>Active</label><label><input className="mr-2" type="checkbox" name="receiveCreated" defaultChecked={recipient ? recipient.receiveCreated === 1 : true}/>New appointments</label><label><input className="mr-2" type="checkbox" name="receiveUpdated" defaultChecked={recipient ? recipient.receiveUpdated === 1 : true}/>Edited / rescheduled</label><label><input className="mr-2" type="checkbox" name="receiveCancelled" defaultChecked={recipient ? recipient.receiveCancelled === 1 : true}/>Cancelled</label></div><button className="ta-button ta-button-primary self-start">{recipient ? "Save recipient" : "Add recipient"}</button></Form>;
}
