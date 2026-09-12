import { describe, it, expect } from "vitest";
import { parseCallWebhook, isTerminalCallStatus, type NormalizedCallEvent } from "@/lib/telephony";

const NOW = new Date("2026-07-12T10:00:00.000Z");

describe("parseCallWebhook", () => {
  type Case = {
    name: string;
    params: Record<string, string>;
    expect: Partial<NormalizedCallEvent>;
  };

  const cases: Case[] = [
    {
      name: "outbound call still ringing (queued)",
      params: { CallSid: "CA1", From: "09820012345", To: "9987654321", Direction: "outbound-api", Status: "queued" },
      expect: { providerCallId: "CA1", direction: "outbound", status: "initiated", startedAt: NOW, endedAt: undefined },
    },
    {
      name: "outbound call ringing",
      params: { CallSid: "CA2", From: "09820012345", To: "9987654321", Direction: "outbound-dial", Status: "ringing" },
      expect: { direction: "outbound", status: "initiated" },
    },
    {
      name: "call answered (in-progress)",
      params: {
        CallSid: "CA3",
        From: "09820012345",
        To: "9987654321",
        Direction: "outbound-api",
        Status: "in-progress",
        StartTime: "2026-07-12 15:31:05",
      },
      expect: { status: "answered", startedAt: new Date("2026-07-12T15:31:05") },
    },
    {
      name: "inbound call completed with duration",
      params: {
        CallSid: "CA4",
        From: "9987654321",
        To: "09820012345",
        Direction: "inbound",
        Status: "completed",
        DialCallDuration: "142",
        StartTime: "2026-07-12 15:31:05",
        EndTime: "2026-07-12 15:33:27",
      },
      expect: {
        direction: "inbound",
        status: "completed",
        durationSec: 142,
        startedAt: new Date("2026-07-12T15:31:05"),
        endedAt: new Date("2026-07-12T15:33:27"),
      },
    },
    {
      name: "busy → missed",
      params: { CallSid: "CA5", From: "09820012345", To: "9987654321", Direction: "outbound-api", Status: "busy" },
      expect: { status: "missed" },
    },
    {
      name: "no-answer → missed",
      params: { CallSid: "CA6", From: "09820012345", To: "9987654321", Direction: "outbound-api", Status: "no-answer" },
      expect: { status: "missed" },
    },
    {
      name: "canceled → missed",
      params: { CallSid: "CA7", From: "09820012345", To: "9987654321", Direction: "outbound-api", Status: "canceled" },
      expect: { status: "missed" },
    },
    {
      name: "failed stays failed",
      params: { CallSid: "CA8", From: "09820012345", To: "9987654321", Direction: "outbound-api", Status: "failed" },
      expect: { status: "failed" },
    },
    {
      name: "unknown/unrecognized status → failed",
      params: { CallSid: "CA9", From: "09820012345", To: "9987654321", Direction: "outbound-api", Status: "some-new-exotel-status" },
      expect: { status: "failed" },
    },
    {
      name: "missing Status entirely → failed",
      params: { CallSid: "CA10", From: "09820012345", To: "9987654321", Direction: "outbound-api" },
      expect: { status: "failed" },
    },
    {
      name: "missing Direction → defaults to outbound",
      params: { CallSid: "CA11", From: "09820012345", To: "9987654321", Status: "completed" },
      expect: { direction: "outbound" },
    },
    {
      name: "missing CallSid/From/To → empty strings, not throw",
      params: { Status: "completed" },
      expect: { providerCallId: "", from: "", to: "" },
    },
    {
      name: "missing StartTime falls back to `now`",
      params: { CallSid: "CA12", From: "1", To: "2", Direction: "outbound-api", Status: "queued" },
      expect: { startedAt: NOW },
    },
    {
      name: "terminal status with missing EndTime falls back to `now`",
      params: { CallSid: "CA13", From: "1", To: "2", Direction: "outbound-api", Status: "completed" },
      expect: { endedAt: NOW },
    },
    {
      name: "non-terminal status with missing EndTime leaves endedAt undefined",
      params: { CallSid: "CA14", From: "1", To: "2", Direction: "outbound-api", Status: "ringing" },
      expect: { endedAt: undefined },
    },
    {
      name: "garbage DialCallDuration is dropped, not NaN",
      params: { CallSid: "CA15", From: "1", To: "2", Direction: "outbound-api", Status: "completed", DialCallDuration: "not-a-number" },
      expect: { durationSec: undefined },
    },
    {
      name: "negative DialCallDuration clamps to 0",
      params: { CallSid: "CA16", From: "1", To: "2", Direction: "outbound-api", Status: "completed", DialCallDuration: "-5" },
      expect: { durationSec: 0 },
    },
    {
      name: "fractional DialCallDuration truncates",
      params: { CallSid: "CA17", From: "1", To: "2", Direction: "outbound-api", Status: "completed", DialCallDuration: "12.9" },
      expect: { durationSec: 12 },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = parseCallWebhook(c.params, NOW);
      for (const [key, value] of Object.entries(c.expect)) {
        expect(result[key as keyof NormalizedCallEvent]).toEqual(value);
      }
    });
  }

  it("defaults `now` to the current time when not passed", () => {
    const before = Date.now();
    const result = parseCallWebhook({ CallSid: "CA-live", Status: "queued" });
    const after = Date.now();
    expect(result.startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.startedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("isTerminalCallStatus", () => {
  it.each([
    ["completed", true],
    ["missed", true],
    ["failed", true],
    ["initiated", false],
    ["answered", false],
    ["bogus", false],
  ])("status %s → %s", (status, expected) => {
    expect(isTerminalCallStatus(status)).toBe(expected);
  });
});
