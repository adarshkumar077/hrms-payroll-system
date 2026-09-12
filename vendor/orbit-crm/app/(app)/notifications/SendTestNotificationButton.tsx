"use client";

import { useTransition } from "react";
import { sendTestNotificationAction } from "./actions";

export function SendTestNotificationButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => sendTestNotificationAction())}
      disabled={pending}
      className="btn bg-brand-600 hover:bg-brand-700 text-white text-sm"
    >
      {pending ? "Sending..." : "Send test notification"}
    </button>
  );
}
