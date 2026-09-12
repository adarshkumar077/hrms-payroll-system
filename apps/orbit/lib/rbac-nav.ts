import { NAV, type NavGroup } from "./nav";
import { can } from "./rbac";
import type { Session } from "./auth";
import { getStudioConfig, moduleLabel } from "./studio/config";

// Primary route per module — these single-noun nav items take the tenant's
// (Studio-editable) plural label. Multi-item modules (hr, finance, …) keep
// their per-page labels until the WS2 full label sweep.
const PRIMARY_ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "dashboard",
  "/leads": "leads",
  "/opportunities": "opportunities",
  "/accounts": "accounts",
  "/quotations": "quotations",
  "/tickets": "tickets",
};

/**
 * Server-side nav: static NAV is the route registry (hrefs/icons); Studio
 * ModuleConfig supplies labels + enabled/inNav; RBAC supplies visibility.
 * Visibility ≠ permission — pages still enforce can() themselves.
 */
export async function allowedNav(session: Session): Promise<NavGroup[]> {
  const config = await getStudioConfig(session.tenantId);

  const modules = Array.from(new Set(NAV.flatMap((g) => g.items.map((i) => i.module))));
  const grants = session.isCeo
    ? new Set(modules)
    : new Set(
        (await Promise.all(modules.map(async (m) => [m, await can(session, m, "read")] as const)))
          .filter(([, ok]) => ok)
          .map(([m]) => m)
      );

  return NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => {
        if (!grants.has(i.module)) return false;
        const mc = config.modules.get(i.module);
        return mc ? mc.enabled && mc.inNav : true;
      })
      .map((i) => {
        const labelModule = PRIMARY_ROUTE_LABELS[i.href];
        return labelModule ? { ...i, label: moduleLabel(config, labelModule, "plural") } : i;
      }),
  })).filter((g) => g.items.length > 0);
}
