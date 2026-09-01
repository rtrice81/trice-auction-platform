export type EmailMessage = { to: string; subject: string; text: string; html?: string; replyTo?: string };
export type SendResult = { providerMessageId?: string };
export interface EmailProvider { send(message: EmailMessage): Promise<SendResult>; }

export function createResendEmailProvider(config: { apiKey?: string; from?: string }): EmailProvider {
  return { async send(message) {
    if (!config.apiKey || !config.from) throw new Error("Email delivery is not configured.");
    const { replyTo, ...payload } = message;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: config.from, ...(replyTo ? { reply_to: replyTo } : {}), ...payload }) });
    const body = await response.json() as { id?: string; message?: string };
    if (!response.ok) throw new Error(body.message || "Resend rejected the email.");
    return { providerMessageId: body.id };
  } };
}
