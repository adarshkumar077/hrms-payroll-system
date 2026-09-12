import type { ReactNode } from "react";

/**
 * Orbit Studio — Universal Record Page shell (WS5).
 *
 * Generic 3-rail layout shared by every module's record detail page: a
 * header, a left rail of fields (fixed width), a flexible center column
 * (timeline / primary content), and an optional right rail (secondary
 * panels — conversion status, AI assist, etc). Stacks to a single column
 * on mobile. Purely layout — no data fetching, no module knowledge.
 */
export function RecordShell({
  header,
  left,
  center,
  right,
}: {
  header: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div>
      {header}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:w-80 shrink-0 space-y-4">{left}</div>
        <div className="flex-1 min-w-0 space-y-4">{center}</div>
        {right && <div className="w-full lg:w-72 shrink-0 space-y-4">{right}</div>}
      </div>
    </div>
  );
}
