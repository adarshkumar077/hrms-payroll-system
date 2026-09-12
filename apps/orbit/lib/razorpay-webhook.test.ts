import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyRazorpaySignature, parseWebhookEvent } from "@/lib/razorpay-webhook";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyRazorpaySignature", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = sign(body);
    expect(verifyRazorpaySignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = sign(body, "wrong-secret");
    expect(verifyRazorpaySignature(body, sig, SECRET)).toBe(false);
  });

  it("rejects a tampered body (same-length signature, different content)", () => {
    const body = JSON.stringify({ event: "payment.captured", amount: 100 });
    const sig = sign(body);
    const tampered = JSON.stringify({ event: "payment.captured", amount: 999 });
    expect(verifyRazorpaySignature(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a signature of a different (shorter) length", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyRazorpaySignature(body, "abc123", SECRET)).toBe(false);
  });

  it("rejects when the signature is empty", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyRazorpaySignature(body, "", SECRET)).toBe(false);
  });

  it("rejects when the body is empty", () => {
    const sig = sign("");
    expect(verifyRazorpaySignature("", sig, SECRET)).toBe(false);
  });

  it("rejects when the secret is empty", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = sign(body);
    expect(verifyRazorpaySignature(body, sig, "")).toBe(false);
  });
});

describe("parseWebhookEvent", () => {
  it("parses a well-formed payment.captured event with invoice notes", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_ABC123",
            amount: 250000, // paise
            order_id: "order_XYZ789",
            notes: { kind: "invoice", tenantId: "t1", invoiceId: "inv1" },
          },
        },
      },
    });

    const parsed = parseWebhookEvent(body);
    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("payment.captured");
    expect(parsed?.paymentId).toBe("pay_ABC123");
    expect(parsed?.orderId).toBe("order_XYZ789");
    expect(parsed?.notes).toEqual({ kind: "invoice", tenantId: "t1", invoiceId: "inv1" });
  });

  it("converts paise to rupees", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", amount: 249900, notes: {} } } },
    });
    expect(parseWebhookEvent(body)?.amount).toBe(2499);
  });

  it("falls back to the order entity's notes when the payment has none", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_1", amount: 100000 } },
        order: { entity: { id: "order_1", notes: { kind: "plan", tenantId: "t1", plan: "growth" } } },
      },
    });
    const parsed = parseWebhookEvent(body);
    expect(parsed?.notes).toEqual({ kind: "plan", tenantId: "t1", plan: "growth" });
    expect(parsed?.orderId).toBe("order_1");
  });

  it("returns an empty notes object when neither entity has notes", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", amount: 100000 } } },
    });
    expect(parseWebhookEvent(body)?.notes).toEqual({});
  });

  it("returns null for corrupt JSON", () => {
    expect(parseWebhookEvent("{not valid json")).toBeNull();
  });

  it("returns null when the payment entity is missing", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    expect(parseWebhookEvent(body)).toBeNull();
  });

  it("returns null when the payload is missing entirely", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(parseWebhookEvent(body)).toBeNull();
  });

  it("returns null when `event` is missing", () => {
    const body = JSON.stringify({
      payload: { payment: { entity: { id: "pay_1", amount: 100000, notes: {} } } },
    });
    expect(parseWebhookEvent(body)).toBeNull();
  });

  it("returns null for a top-level JSON array", () => {
    expect(parseWebhookEvent(JSON.stringify([1, 2, 3]))).toBeNull();
  });
});
