type PastDueEmailInput = {
  eventId: string;
  email: string;
  customerName?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  updatePaymentUrl?: string;
};

type EmailResult = { sent: true; id: string } | { sent: false; reason: "not_configured" | "invalid_recipient" | "provider_error" };

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_UPDATE_PAYMENT_URL = "https://studio.tryskilly.app/dashboard/settings/billing";

export function buildPastDueEmail(input: PastDueEmailInput): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.customerName?.trim() || "there");
  const amount = formatAmount(input.amountCents, input.currency);
  const paymentUrl = input.updatePaymentUrl ?? DEFAULT_UPDATE_PAYMENT_URL;
  return {
    subject: "Action needed: update your Skilly payment method",
    html: `<p>Hi ${name},</p><p>We couldn’t process your ${amount} Skilly subscription renewal. Your access may be paused until the payment method is updated.</p><p><a href="${escapeHtml(paymentUrl)}">Update your payment method</a>, then Polar will retry the payment automatically.</p><p>If you need help, reply to this email and we’ll assist you.</p><p>— The Skilly team</p>`,
    text: `Hi ${input.customerName?.trim() || "there"},\n\nWe couldn’t process your ${amount} Skilly subscription renewal. Your access may be paused until the payment method is updated.\n\nUpdate your payment method: ${paymentUrl}\n\nPolar will retry the payment automatically. If you need help, reply to this email.\n\n— The Skilly team`,
  };
}

export async function sendPastDueEmail(input: PastDueEmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_BILLING_FROM;
  if (!apiKey || !from) return { sent: false, reason: "not_configured" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { sent: false, reason: "invalid_recipient" };
  const message = buildPastDueEmail(input);
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `skilly-subscription-past-due/${input.eventId}` },
      body: JSON.stringify({ from, to: [input.email], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { sent: false, reason: "provider_error" };
    const data = (await response.json()) as { id?: unknown };
    return typeof data.id === "string" ? { sent: true, id: data.id } : { sent: false, reason: "provider_error" };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}

function formatAmount(cents: number | null | undefined, currency: string | null | undefined): string {
  if (!Number.isFinite(cents)) return "subscription";
  return `${(Number(cents) / 100).toFixed(2)} ${(currency || "usd").toUpperCase()}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
