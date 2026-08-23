import { describe, expect, test } from "bun:test";
import { buildPastDueEmail } from "../src/lib/billingEmail";

describe("buildPastDueEmail", () => {
  test("renders an escaped payment update message", () => {
    const email = buildPastDueEmail({ eventId: "evt_1", email: "customer@example.com", customerName: "<Gabriel>", amountCents: 1900, currency: "usd" });
    expect(email.subject).toContain("update your Skilly payment method");
    expect(email.html).toContain("&lt;Gabriel&gt;");
    expect(email.html).toContain("19.00 USD");
    expect(email.text).toContain("Update your payment method:");
  });
});
