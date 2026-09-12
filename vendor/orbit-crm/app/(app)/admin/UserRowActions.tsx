"use client";

import { useTransition } from "react";
import { toggleUserActiveAction, assignRoleAction } from "./actions";

type Role = { id: string; name: string };

export function UserRowActions({
  userId,
  active,
  roleId,
  roles,
  disabled,
}: {
  userId: string;
  active: boolean;
  roleId: string | null;
  roles: Role[];
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2 justify-end">
      <select
        className="input py-1 text-xs w-auto"
        value={roleId || ""}
        disabled={pending || disabled}
        onChange={(e) => start(() => assignRoleAction(userId, e.target.value || null))}
      >
        <option value="">No role</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button
        className="btn-ghost text-xs py-1"
        disabled={pending || disabled}
        onClick={() => start(() => toggleUserActiveAction(userId, !active))}
      >
        {pending ? "…" : active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}
