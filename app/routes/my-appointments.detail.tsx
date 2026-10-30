import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/my-appointments.detail";
import { requireUser } from "../services/auth.server";
import { getCustomerDropoff, updateCustomerDropoffDescription } from "../services/customer-appointments.server";
import { cancelWaitlistableAppointment, queueAppointmentRescheduled } from "../services/notification.server";
import { getInternalAppointmentSnapshot, internalAppointmentDetailsChanged } from "../services/internal-appointment-notifications.server";
import { ConfirmationForm } from "../components/confirmation-form";
import { Button, FormField, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const appointment = await getCustomerDropoff(env.trice_auction_db, user.id, Number(params.id));
  if (!appointment) throw new Response("Not Found", { status: 404 });
  return { appointment };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const appointmentId = Number(params.id);
  const appointment = await getCustomerDropoff(env.trice_auction_db, user.id, appointmentId);
  if (!appointment) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  if (form.get("intent") === "cancel" && Array.from(form.keys()).every(key => key === "intent") && form.getAll("intent").length === 1) {
    const result = await cancelWaitlistableAppointment(env.trice_auction_db, appointmentId, env as never, user.email, user.id);
    return result.cancelled ? data({ message: "Your appointment has been cancelled." }) : data({ error: "This appointment can no longer be cancelled." }, { status: 400 });
  }
  // Reject unexpected fields, including fields from old edit forms.
  if (Array.from(form.keys()).some(key => key !== "description") || form.getAll("description").length !== 1 || typeof form.get("description") !== "string") {
    return data({ error: "Only What you are bringing can be updated." }, { status: 400 });
  }
  const previous = await getInternalAppointmentSnapshot(env.trice_auction_db, appointmentId);
  const result = await updateCustomerDropoffDescription(env.trice_auction_db, user.id, appointmentId, form.get("description") as string);
  if (!result.ok) return data({ error: result.error }, { status: result.notFound ? 404 : 400 });
  const current = await getInternalAppointmentSnapshot(env.trice_auction_db, appointmentId);
  if (internalAppointmentDetailsChanged(previous, current)) await queueAppointmentRescheduled(env.trice_auction_db, appointmentId, { previous, actorName: user.email, notifyCustomer: false });
  return data({ message: "What you are bringing has been updated." });
}

export default function Detail({ loaderData, actionData }: Route.ComponentProps) {
  const { appointment } = loaderData;
  return <PageShell><div className="max-w-3xl">
    <Link to="/my-appointments" className="text-sm font-bold text-[#9d302f]">← My Appointments</Link>
    <PageIntro eyebrow="Customer portal" title="Appointment details">Review your appointment. Please contact us if other changes are needed.</PageIntro>
    {actionData && "error" in actionData ? <Notice variant="error">{actionData.error}</Notice> : null}
    {actionData && "message" in actionData ? <Notice variant="success">{actionData.message}</Notice> : null}
    <PageCard title={appointment.eventName || (appointment.visibility === "private" ? "Private appointment" : "Drop-off appointment")}>
      <dl className="grid gap-5 sm:grid-cols-2">
        <div><dt className="font-semibold">Drop-off date</dt><dd>{appointment.appointmentDate}</dd></div>
        {appointment.appointmentTime ? <div><dt className="font-semibold">Appointment time</dt><dd>{appointment.appointmentTime}</dd></div> : null}
        <div><dt className="font-semibold">Load type</dt><dd>{appointment.loadType}</dd></div>
        <div><dt className="font-semibold">Status</dt><dd className="capitalize">{appointment.status}</dd></div>
        <div className="sm:col-span-2"><dt className="font-semibold">Item allocations</dt><dd>{appointment.allocations.length ? appointment.allocations.map(area => `${area.name}: ${area.percentage}%`).join(" · ") : "No allocations recorded."}</dd></div>
      </dl>
      <Form method="post" className="mt-6 grid gap-5">
        <FormField label="What you are bringing"><textarea name="description" rows={5} maxLength={2000} defaultValue={appointment.description ?? ""} placeholder="Example: glassware, household items, lawn mower, bedroom suite, car, tools, collectibles, etc." className="min-h-32" /></FormField>
        <div><Button>Update What You Are Bringing</Button></div>
      </Form>
    </PageCard>
    {appointment.status === "scheduled" || appointment.status === "waitlisted" ? <ConfirmationForm method="post" className="mt-5" confirmation={{ title: "Cancel drop-off appointment?", description: "Are you sure you want to cancel this drop-off appointment?", confirmLabel: "Cancel appointment", destructive: true }}><input type="hidden" name="intent" value="cancel"/><Button variant="destructive">Cancel appointment</Button></ConfirmationForm> : null}
  </div></PageShell>;
}
