import { describe, it, expect } from "vitest";
import { parseDeliveryWebhook, isStatusUpgrade, verifyWebhookToken, type DeliveryStatus } from "@/lib/whatsapp";

describe("parseDeliveryWebhook", () => {
  it("parses the documented sid/status text shape", () => {
    expect(parseDeliveryWebhook({ sid: "msg_123", status: "delivered" })).toEqual({
      providerMsgId: "msg_123",
      status: "delivered",
    });
  });

  it("accepts the message_sid key-name variant", () => {
    expect(parseDeliveryWebhook({ message_sid: "msg_456", status: "sent" })).toEqual({
      providerMsgId: "msg_456",
      status: "sent",
    });
  });

  it("accepts the id key-name variant", () => {
    expect(parseDeliveryWebhook({ id: "msg_789", status: "read" })).toEqual({
      providerMsgId: "msg_789",
      status: "read",
    });
  });

  it("normalizes 'seen' status text to 'read'", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", status: "seen" })).toEqual({
      providerMsgId: "msg_1",
      status: "read",
    });
  });

  it("normalizes 'undelivered'/'error'/'rejected' status text to 'failed'", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", status: "undelivered" })?.status).toBe("failed");
    expect(parseDeliveryWebhook({ sid: "msg_2", status: "error" })?.status).toBe("failed");
    expect(parseDeliveryWebhook({ sid: "msg_3", status: "rejected" })?.status).toBe("failed");
  });

  it("is case/whitespace tolerant on status text", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", status: "  DELIVERED  " })?.status).toBe("delivered");
  });

  it("falls back to numeric exo_status_code when status text is absent", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", exo_status_code: 30002 })).toEqual({
      providerMsgId: "msg_1",
      status: "delivered",
    });
    expect(parseDeliveryWebhook({ sid: "msg_2", exo_status_code: 30001 })?.status).toBe("sent");
    expect(parseDeliveryWebhook({ sid: "msg_3", exo_status_code: 30003 })?.status).toBe("read");
  });

  it("maps any code in the 30004-30041 failure range to 'failed'", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", exo_status_code: 30004 })?.status).toBe("failed");
    expect(parseDeliveryWebhook({ sid: "msg_2", exo_status_code: 30041 })?.status).toBe("failed");
  });

  it("accepts a numeric code passed as a string", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", exo_status_code: "30002" })?.status).toBe("delivered");
  });

  it("prefers status text over exo_status_code when both are present", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", status: "read", exo_status_code: 30001 })?.status).toBe("read");
  });

  it("falls back to the code when status text is unrecognized", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", status: "pending_review", exo_status_code: 30002 })?.status).toBe(
      "delivered",
    );
  });

  it("returns null for an unrecognized status with no usable code", () => {
    expect(parseDeliveryWebhook({ sid: "msg_1", status: "pending_review" })).toBeNull();
    expect(parseDeliveryWebhook({ sid: "msg_1", exo_status_code: 99999 })).toBeNull();
  });

  it("returns null when the message id is missing", () => {
    expect(parseDeliveryWebhook({ status: "delivered" })).toBeNull();
  });

  it("returns null when the id is not a string", () => {
    expect(parseDeliveryWebhook({ sid: 12345, status: "delivered" })).toBeNull();
  });

  it("returns null for non-object payloads (unknown payload shapes)", () => {
    expect(parseDeliveryWebhook(null)).toBeNull();
    expect(parseDeliveryWebhook(undefined)).toBeNull();
    expect(parseDeliveryWebhook("not json")).toBeNull();
    expect(parseDeliveryWebhook(42)).toBeNull();
    expect(parseDeliveryWebhook(true)).toBeNull();
  });

  it("returns null for a top-level JSON array", () => {
    expect(parseDeliveryWebhook([{ sid: "msg_1", status: "delivered" }])).toBeNull();
  });

  it("returns null for a completely empty object", () => {
    expect(parseDeliveryWebhook({})).toBeNull();
  });
});

describe("isStatusUpgrade (monotonic ranking)", () => {
  const cases: Array<[DeliveryStatus, DeliveryStatus, boolean]> = [
    ["queued", "sent", true],
    ["sent", "delivered", true],
    ["delivered", "read", true],
    ["queued", "delivered", true],
    ["queued", "read", true],
    ["sent", "read", true],
    ["delivered", "sent", false], // never downgrade delivered -> sent
    ["read", "delivered", false],
    ["read", "sent", false],
    ["sent", "queued", false],
    ["delivered", "delivered", false], // no-op is not an upgrade
    ["sent", "sent", false],
    ["sent", "failed", true],
    ["delivered", "failed", true],
    ["read", "failed", true],
    ["queued", "failed", true],
    ["failed", "sent", false], // failed is terminal
    ["failed", "delivered", false],
    ["failed", "read", false],
    ["failed", "failed", false],
  ];

  it.each(cases)("isStatusUpgrade(%s, %s) === %s", (from, to, expected) => {
    expect(isStatusUpgrade(from, to)).toBe(expected);
  });

  it("treats an unrecognized 'from' status as fail-closed (never an upgrade)", () => {
    expect(isStatusUpgrade("bogus", "delivered")).toBe(false);
  });

  it("treats an unrecognized 'to' status as fail-closed (never an upgrade)", () => {
    expect(isStatusUpgrade("sent", "bogus")).toBe(false);
  });
});

describe("verifyWebhookToken", () => {
  it("accepts a matching token", () => {
    expect(verifyWebhookToken("secret-abc", "secret-abc")).toBe(true);
  });

  it("rejects a mismatched token of the same length", () => {
    expect(verifyWebhookToken("secret-abd", "secret-abc")).toBe(false);
  });

  it("rejects a token of a different length", () => {
    expect(verifyWebhookToken("short", "secret-abc")).toBe(false);
  });

  it("rejects when the expected token is unset", () => {
    expect(verifyWebhookToken("anything", undefined)).toBe(false);
    expect(verifyWebhookToken("anything", null)).toBe(false);
    expect(verifyWebhookToken("anything", "")).toBe(false);
  });

  it("rejects an empty given token against a real expected token", () => {
    expect(verifyWebhookToken("", "secret-abc")).toBe(false);
  });
});
