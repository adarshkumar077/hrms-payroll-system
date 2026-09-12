import { describe, expect, it } from "vitest";
import { evalPerms, evalFieldHidden, DEFAULT_MEMBER_PERMISSIONS } from "@/lib/rbac";

describe("evalPerms (fail-closed)", () => {
  const perms = JSON.stringify({ leads: ["read", "write"], payroll: ["read"] });

  it("grants explicitly listed module+action", () => {
    expect(evalPerms(perms, "leads", "read")).toBe(true);
    expect(evalPerms(perms, "leads", "write")).toBe(true);
    expect(evalPerms(perms, "payroll", "read")).toBe(true);
  });

  it("denies action not listed for the module", () => {
    expect(evalPerms(perms, "payroll", "write")).toBe(false);
  });

  it("denies module not listed", () => {
    expect(evalPerms(perms, "finance", "read")).toBe(false);
  });

  it("denies on empty permissions object", () => {
    expect(evalPerms("{}", "leads", "read")).toBe(false);
  });

  it("denies on null/undefined/empty string", () => {
    expect(evalPerms(null, "leads", "read")).toBe(false);
    expect(evalPerms(undefined, "leads", "read")).toBe(false);
    expect(evalPerms("", "leads", "read")).toBe(false);
  });

  it("denies on corrupt JSON (the old code granted here)", () => {
    expect(evalPerms("{not json", "leads", "read")).toBe(false);
  });

  it("denies when module value is not an array", () => {
    expect(evalPerms(JSON.stringify({ leads: "read" }), "leads", "read")).toBe(false);
    expect(evalPerms(JSON.stringify({ leads: { read: true } }), "leads", "read")).toBe(false);
  });

  it("default member permissions cover business modules but not admin/billing", () => {
    const json = JSON.stringify(DEFAULT_MEMBER_PERMISSIONS);
    expect(evalPerms(json, "leads", "write")).toBe(true);
    expect(evalPerms(json, "finance", "write")).toBe(true);
    expect(evalPerms(json, "payroll", "read")).toBe(true);
    expect(evalPerms(json, "payroll", "write")).toBe(false);
    expect(evalPerms(json, "admin", "read")).toBe(false);
    expect(evalPerms(json, "billing", "read")).toBe(false);
  });
});

describe("evalFieldHidden (fail-closed)", () => {
  it("hides when explicitly marked hidden", () => {
    const perms = JSON.stringify({ _fields: { "payslip.netPay": "hidden" } });
    expect(evalFieldHidden(perms, "payslip.netPay")).toBe(true);
    expect(evalFieldHidden(perms, "payslip.gross")).toBe(false);
  });

  it("hides on corrupt or missing permissions", () => {
    expect(evalFieldHidden("{oops", "payslip.netPay")).toBe(true);
    expect(evalFieldHidden(null, "payslip.netPay")).toBe(true);
  });

  it("does not hide when _fields absent", () => {
    expect(evalFieldHidden("{}", "payslip.netPay")).toBe(false);
  });
});
