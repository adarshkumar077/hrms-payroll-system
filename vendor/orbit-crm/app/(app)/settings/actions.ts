"use server";

import { revalidatePath } from "next/cache";
import { requireSession, changePassword, beginEnroll2FA, confirmEnroll2FA, disable2FA } from "@/lib/auth";

export async function changePasswordAction(formData: FormData) {
  const s = await requireSession();
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");

  if (next.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  const ok = await changePassword(s.userId, current, next);
  if (!ok) {
    return { error: "Current password is incorrect." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

// ── Two-factor authentication ────────────────────────────────

export async function beginEnroll2FAAction() {
  const s = await requireSession();
  const { secret, svg } = await beginEnroll2FA(s.userId, s.email);
  return { secret, svg };
}

export async function confirmEnroll2FAAction(formData: FormData) {
  const s = await requireSession();
  const code = String(formData.get("code") || "");

  const codes = await confirmEnroll2FA(s.userId, code);
  if (!codes) {
    return { error: "Invalid code. Please check your authenticator app and try again." };
  }

  revalidatePath("/settings");
  return { ok: true, codes };
}

export async function disable2FAAction(formData: FormData) {
  const s = await requireSession();
  const password = String(formData.get("password") || "");

  const ok = await disable2FA(s.userId, password);
  if (!ok) {
    return { error: "Current password is incorrect." };
  }

  revalidatePath("/settings");
  return { ok: true };
}
