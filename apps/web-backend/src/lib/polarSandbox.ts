import type { NextRequest } from "next/server";
import { validateBillingEnvironment } from "@/domain/billingEnvironment";
import { isValidBillingUrl } from "@/domain/billing";
import { logBillingFailure } from "@/lib/billingDiagnostics";

export type PolarSandboxProduct = "builder-starter" | "mac";
export function isAllowedPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalized = host.split(":")[0].toLowerCase();
  return [process.env.SKILLY_PREVIEW_HOST, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
    .filter((value): value is string => Boolean(value && value.trim()))
    .some((allowed) => allowed.split(":")[0].toLowerCase() === normalized);
}
export interface SandboxCheckoutSession { tenantId: string; workosUserId?: string; email?: string | null }
export async function orchestratePolarSandboxCheckout(input: { product: PolarSandboxProduct; session: SandboxCheckoutSession; requestUrl: string; cookie?: string | null; fetchImpl?: typeof fetch; mintToken: (user: { id: string; email: string; firstName: null; lastName: null }) => string }): Promise<{ status: number; body: Record<string, unknown> }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  let path: string; let payload: Record<string, unknown>;
  if (input.product === "builder-starter") { path = "/api/web/checkout"; payload = { plan: "starter" }; if (input.cookie) headers.cookie = input.cookie; }
  else { if (!input.session.workosUserId || !input.session.email) return { status: 409, body: { error: "desktop identity unavailable" } }; headers.authorization = `Bearer ${input.mintToken({ id: input.session.workosUserId, email: input.session.email, firstName: null, lastName: null })}`; if (input.cookie) headers.cookie = input.cookie; path = "/api/mac/checkout"; payload = { checkout_attempt_id: `sandbox-${crypto.randomUUID()}` }; }
  const surface = input.product === "mac" ? "mac_checkout" : "builder_checkout";
  let response: Response;
  try {
    response = await fetchImpl(new URL(path, input.requestUrl), { method: "POST", headers, body: JSON.stringify(payload) });
  } catch {
    logBillingFailure({ surface, reason: "provider_network_error" });
    return { status: 502, body: { error: "checkout creation failed" } };
  }
  if (!response.ok) {
    logBillingFailure({ surface, status: response.status, reason: "internal_checkout_non_2xx" });
    return { status: 502, body: { error: "checkout creation failed" } };
  }
  let data: Record<string, unknown> | null;
  try {
    const parsed: unknown = await response.json();
    data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    logBillingFailure({ surface, status: response.status, reason: "provider_invalid_json" });
    return { status: 502, body: { error: "checkout creation failed" } };
  }
  if (!data) {
    logBillingFailure({ surface, status: response.status, reason: "provider_missing_url" });
    return { status: 502, body: { error: "checkout creation failed" } };
  }
  const url = typeof data?.url === "string" ? data.url : typeof data?.checkout_url === "string" ? data.checkout_url : null;
  if (!url) {
    logBillingFailure({ surface, status: response.status, reason: "provider_missing_url" });
    return { status: 502, body: { error: "checkout creation failed" } };
  }
  let allowed = false; try { const hostname = new URL(url).hostname; allowed = isValidBillingUrl(url) && (hostname === "sandbox.polar.sh" || hostname.endsWith(".sandbox.polar.sh")); } catch {}
  if (!allowed) {
    logBillingFailure({ surface, status: response.status, reason: "provider_invalid_url" });
    return { status: 502, body: { error: "checkout creation failed" } };
  }
  return { status: 200, body: { url } };
}

export async function orchestratePolarSandboxPortal(input: { session: SandboxCheckoutSession; requestUrl: string; cookie?: string | null; fetchImpl?: typeof fetch; mintToken: (user: { id: string; email: string; firstName: null; lastName: null }) => string }): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!input.session.workosUserId || !input.session.email) return { status: 409, body: { error: "desktop identity unavailable" } };
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = input.mintToken({ id: input.session.workosUserId, email: input.session.email, firstName: null, lastName: null });
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (input.cookie) headers.cookie = input.cookie;
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/mac/portal", input.requestUrl), { method: "GET", headers });
  } catch {
    logBillingFailure({ surface: "mac_checkout", reason: "provider_network_error" });
    return { status: 502, body: { error: "portal session failed" } };
  }
  if (!response.ok) {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "internal_checkout_non_2xx" });
    return { status: 502, body: { error: "portal session failed" } };
  }
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_invalid_json" });
    return { status: 502, body: { error: "portal session failed" } };
  }
  const portalUrl = typeof data?.portal_url === "string" ? data.portal_url : null;
  let allowed = false;
  try { allowed = isValidBillingUrl(portalUrl) && new URL(portalUrl).hostname === "sandbox.polar.sh"; } catch {}
  if (!allowed) {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_invalid_url" });
    return { status: 502, body: { error: "portal session failed" } };
  }
  return { status: 200, body: { portal_url: portalUrl } };
}

/** The harness is intentionally narrower than the general billing guard. */
export function validatePolarSandboxRequest(request: NextRequest, productId?: string | null): { ok: true; apiBase: string } | { ok: false } {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isAllowedPreviewHost(host)) {
    return { ok: false };
  }
  const origin = request.headers.get("origin");
  if (!origin) return { ok: false };
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "https:" || parsedOrigin.host.toLowerCase() !== (host ?? "").toLowerCase()) return { ok: false };
  } catch { return { ok: false }; }
  const billing = validateBillingEnvironment({ surface: productId === process.env.POLAR_MAC_PRODUCT_ID ? "personal" : "builder", productId, host });
  return billing.ok && billing.mode === "sandbox" && billing.apiBase === "https://sandbox-api.polar.sh"
    ? { ok: true, apiBase: billing.apiBase }
    : { ok: false };
}
