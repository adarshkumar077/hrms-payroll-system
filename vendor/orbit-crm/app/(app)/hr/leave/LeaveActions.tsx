"use client";

import { approveLeave, rejectLeave } from "./actions";

export function LeaveActions({ id }: { id: string }) {
  return (
    <div className="flex justify-end gap-2">
      <form action={approveLeave}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn text-xs py-1 px-2">
          Approve
        </button>
      </form>
      <form action={rejectLeave}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-ghost text-xs py-1 px-2">
          Reject
        </button>
      </form>
    </div>
  );
}
