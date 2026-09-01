import { createRequestHandler } from "react-router";
import { handleSmsKeyword, processDueNotificationJobs } from "../app/services/notification.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/webhooks/telnyx/sms" && request.method === "POST") {
      const config = env as Env & { TELNYX_WEBHOOK_PUBLIC_KEY?: string };
      const raw = await request.text();
      if (!config.TELNYX_WEBHOOK_PUBLIC_KEY || !await validTelnyxSignature(request.headers, raw, config.TELNYX_WEBHOOK_PUBLIC_KEY)) return new Response("Invalid webhook signature.", { status: 401 });
      const event = JSON.parse(raw) as { data?: { payload?: { from?: { phone_number?: string }; text?: string } } };
      await handleSmsKeyword(env.trice_auction_db, event.data?.payload?.from?.phone_number || "", event.data?.payload?.text || "");
      return new Response(null, { status: 204 });
    }
    return requestHandler(request);
  },
  async scheduled(_controller, env) {
    await processDueNotificationJobs(env.trice_auction_db, env as never);
  },
} satisfies ExportedHandler<Env>;

async function validTelnyxSignature(headers: Headers, body: string, publicKey: string) {
  const signature = headers.get("telnyx-signature-ed25519");
  const timestamp = headers.get("telnyx-timestamp");
  if (!signature || !timestamp) return false;
  try {
    const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", decode(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "Ed25519" }, key, decode(signature), new TextEncoder().encode(`${timestamp}|${body}`));
  } catch { return false; }
}
