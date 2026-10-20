import type { SendResult } from "./email-provider.server";
import { notificationsAreSuppressed, type EnvironmentPolicy } from "../lib/environment-policy";

export type SmsMessage = { to: string; text: string };
export interface SmsProvider { send(message: SmsMessage): Promise<SendResult>; }

export function createTelnyxSmsProvider(config: { apiKey?: string; from?: string; environment?: EnvironmentPolicy }): SmsProvider {
  return { async send(message) {
    if (notificationsAreSuppressed(config.environment ?? {})) {
      console.info("External SMS suppressed (log mode)");
      return { providerMessageId: "suppressed:sms" };
    }
    if (!config.apiKey || !config.from) throw new Error("SMS delivery is not configured.");
    const response = await fetch("https://api.telnyx.com/v2/messages", { method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: config.from, to: message.to, text: message.text }) });
    const body = await response.json() as { data?: { id?: string }; errors?: Array<{ detail?: string }> };
    if (!response.ok) throw new Error(body.errors?.[0]?.detail || "Telnyx rejected the SMS.");
    return { providerMessageId: body.data?.id };
  } };
}
