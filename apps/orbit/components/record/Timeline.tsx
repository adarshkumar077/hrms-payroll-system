import { Badge } from "@/components/ui";
import { shortDate } from "@/lib/format";

/**
 * Orbit Studio — Universal Record Page activity timeline (WS5).
 *
 * Purely presentational vertical feed, newest first. Callers merge whatever
 * sources make sense for their module (Activity rows, EventLog rows, ...)
 * into this generic item shape before rendering.
 */
export type TimelineItem = {
  id: string;
  kind: string; // Note | Call | Task | Meeting | Event | ...
  title: string;
  meta?: string;
  at: Date | string;
};

const KIND_TONE: Record<string, string> = {
  Note: "blue",
  Call: "amber",
  Task: "slate",
  Meeting: "brand",
  Event: "green",
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) {
    return <div className="card p-6 text-center text-sm text-slate-400">No activity yet.</div>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="card p-3 flex items-start gap-3">
          <Badge tone={KIND_TONE[item.kind] || "slate"}>{item.kind}</Badge>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-800">{item.title}</div>
            {item.meta && <div className="text-xs text-slate-500 mt-0.5">{item.meta}</div>}
          </div>
          <div className="text-xs text-slate-400 whitespace-nowrap">{shortDate(item.at)}</div>
        </li>
      ))}
    </ul>
  );
}
