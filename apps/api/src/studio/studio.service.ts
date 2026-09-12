import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

const DEFAULT_WIDGETS = {
  employeeCount: true,
  leaveQueue: true,
  onboarding: true,
  payrollAnomalies: true,
  calendar: true,
  quickActions: true,
};

const DEFAULT_SIDEBAR = { collapsed: false };

export type StudioPayload = {
  displayName?: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  gst?: string | null;
  pan?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  loginLogoUrl?: string | null;
  emailLogoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  darkModeEnabled?: boolean;
  dashboardWidgets?: Record<string, boolean>;
  sidebarConfig?: Record<string, unknown>;
};

@Injectable()
export class StudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const row = await this.ensure(companyId, company);
    return {
      organization: 'Enhance IT Infrastructure (EITF)',
      singleOrganization: true,
      companySelector: false,
      ...row,
      company: company
        ? {
            id: company.id,
            name: company.name,
            legalName: company.legalName,
            email: company.email,
            phone: company.phone,
            website: company.website,
            gstin: company.gstin,
            pan: company.pan,
            logoUrl: company.logoUrl,
            addressLine1: company.addressLine1,
            city: company.city,
            state: company.state,
            pincode: company.pincode,
          }
        : null,
    };
  }

  async updateSettings(user: AuthUser, dto: StudioPayload) {
    await this.ensure(user.companyId);
    const data: Prisma.OrganizationSettingsUpdateInput = {};
    const keys: (keyof StudioPayload)[] = [
      'displayName', 'legalName', 'address', 'phone', 'email', 'website', 'gst', 'pan',
      'logoUrl', 'faviconUrl', 'loginLogoUrl', 'emailLogoUrl',
      'primaryColor', 'secondaryColor', 'accentColor', 'darkModeEnabled',
    ];
    for (const k of keys) {
      if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    }
    if (dto.dashboardWidgets) data.dashboardWidgets = dto.dashboardWidgets as Prisma.InputJsonValue;
    if (dto.sidebarConfig) data.sidebarConfig = dto.sidebarConfig as Prisma.InputJsonValue;

    const updated = await this.prisma.organizationSettings.update({
      where: { companyId: user.companyId },
      data,
    });

    await this.prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(dto.legalName != null ? { legalName: dto.legalName } : {}),
        ...(dto.email != null ? { email: dto.email } : {}),
        ...(dto.phone != null ? { phone: dto.phone } : {}),
        ...(dto.website != null ? { website: dto.website } : {}),
        ...(dto.gst != null ? { gstin: dto.gst } : {}),
        ...(dto.pan != null ? { pan: dto.pan } : {}),
        ...(dto.logoUrl != null ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.address != null ? { addressLine1: dto.address } : {}),
      },
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'OrganizationSettings',
      entityId: updated.id,
      metadata: { fields: Object.keys(dto) },
    });
    return this.getSettings(user.companyId);
  }

  private async ensure(companyId: string, company?: { name: string; legalName: string | null; email: string | null; phone: string | null; website: string | null; gstin: string | null; pan: string | null; logoUrl: string | null; addressLine1: string | null } | null) {
    const existing = await this.prisma.organizationSettings.findUnique({ where: { companyId } });
    if (existing) return existing;
    const c = company ?? (await this.prisma.company.findUnique({ where: { id: companyId } }));
    return this.prisma.organizationSettings.create({
      data: {
        companyId,
        displayName: 'Enhance IT Infrastructure (EITF)',
        legalName: c?.legalName ?? c?.name ?? 'Enhance IT Infrastructure (EITF)',
        address: c?.addressLine1,
        phone: c?.phone,
        email: c?.email,
        website: c?.website,
        gst: c?.gstin,
        pan: c?.pan,
        logoUrl: c?.logoUrl,
        dashboardWidgets: DEFAULT_WIDGETS as Prisma.InputJsonValue,
        sidebarConfig: DEFAULT_SIDEBAR as Prisma.InputJsonValue,
      },
    });
  }
}

export const DEFAULT_ROLE_MATRIX: Record<string, Record<RoleCode, string>> = {
  dashboard: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'FULL', EMPLOYEE: 'OWN' },
  employees: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'FULL', EMPLOYEE: 'OWN' },
  attendance: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'FULL', EMPLOYEE: 'OWN' },
  leave: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'FULL', EMPLOYEE: 'OWN' },
  payroll: { SUPER_ADMIN: 'FULL', ADMIN: 'LIMITED', HR: 'LIMITED', EMPLOYEE: 'OWN' },
  assistant: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'LIMITED', EMPLOYEE: 'OWN' },
  'ai-console': { SUPER_ADMIN: 'FULL', ADMIN: 'READ', HR: 'NONE', EMPLOYEE: 'NONE' },
  studio: { SUPER_ADMIN: 'FULL', ADMIN: 'READ', HR: 'NONE', EMPLOYEE: 'NONE' },
  integrations: { SUPER_ADMIN: 'FULL', ADMIN: 'READ', HR: 'NONE', EMPLOYEE: 'NONE' },
  documents: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'DEPARTMENT', EMPLOYEE: 'OWN' },
  import: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'LIMITED', EMPLOYEE: 'NONE' },
  export: { SUPER_ADMIN: 'FULL', ADMIN: 'FULL', HR: 'LIMITED', EMPLOYEE: 'OWN' },
  admin: { SUPER_ADMIN: 'FULL', ADMIN: 'LIMITED', HR: 'NONE', EMPLOYEE: 'NONE' },
};
