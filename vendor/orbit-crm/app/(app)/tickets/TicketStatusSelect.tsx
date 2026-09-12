"use client";

import { useTransition } from "react";
import { changeTicketStatusAction } from "./actions";

export function TicketStatusSelect({
  ticketId,
  status,
  statusOptions,
}: {
  ticketId: string;
  status: string;
  statusOptions: { value: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input py-1 text-xs w-auto"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => changeTicketStatusAction(ticketId, next));
      }}
    >
      {statusOptions.map((st) => (
        <option key={st.value} value={st.value}>
          {st.label}
        </option>
      ))}
    </select>
  );
}
