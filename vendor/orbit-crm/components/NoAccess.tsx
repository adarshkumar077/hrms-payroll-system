import { PageHeader, Empty } from "@/components/ui";

export function NoAccess({ label }: { label?: string }) {
  return (
    <div>
      <PageHeader title="No access" />
      <Empty>You don&apos;t have access to {label ?? "this module"} — ask an admin to grant it.</Empty>
    </div>
  );
}
