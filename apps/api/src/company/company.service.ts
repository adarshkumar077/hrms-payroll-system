import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateCompanyDto, UpdatePolicyDto } from './dto/company.dto';

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /** Public-facing company card for employees — filtered by field visibility */
  async getCompanyPublic(companyId: string) {
    const c = await this.getCompany(companyId);
    const settings = await this.prisma.companySetting.findMany({
      where: { companyId, group: 'company_profile' },
    });
    const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const visibility =
      (byKey['company.field_visibility'] as Record<string, boolean> | null | undefined) ?? {};

    const show = (field: string, fallback = true) =>
      visibility[field] === undefined ? fallback : Boolean(visibility[field]);

    const out: Record<string, unknown> = { id: c.id };
    if (show('name')) out.name = c.name;
    if (show('legalName')) out.legalName = c.legalName;
    if (show('email')) out.email = c.email;
    if (show('phone')) out.phone = c.phone;
    if (show('website')) out.website = c.website;
    if (show('address')) {
      out.addressLine1 = c.addressLine1;
      out.addressLine2 = c.addressLine2;
      out.city = c.city;
      out.state = c.state;
      out.country = c.country;
      out.pincode = c.pincode;
    }
    if (show('logo')) out.logoUrl = c.logoUrl;
    if (show('gstin')) out.gstin = c.gstin;
    if (show('pan')) out.pan = c.pan;
    if (show('registrationNo')) out.registrationNo = c.registrationNo;
    if (show('timezone')) out.timezone = c.timezone;
    if (show('currency')) out.currency = c.currency;
    if (show('cin')) out.cin = byKey['company.cin'] ?? '';
    if (show('industry')) out.industry = byKey['company.industry'] ?? '';
    if (show('companyType')) out.companyType = byKey['company.company_type'] ?? '';
    if (show('foundedDate')) out.foundedDate = byKey['company.founded_date'] ?? '';
    if (show('description')) out.description = byKey['company.description'] ?? '';
    if (show('branches')) out.branches = byKey['company.branches'] ?? [];
    if (show('contactNumbers')) out.contactNumbers = byKey['company.contact_numbers'] ?? [];
    if (show('socialLinks')) out.socialLinks = byKey['company.social_links'] ?? {};
    if (show('bankDetails')) out.bankDetails = byKey['company.bank_details'] ?? {};
    if (show('upi')) out.upi = byKey['company.upi'] ?? '';
    return out;
  }

  async updateCompany(companyId: string, actorId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'Company',
      entityId: companyId,
      metadata: { fields: Object.keys(dto) },
    });
    return company;
  }

  async getSettings(companyId: string, group?: string) {
    return this.prisma.companySetting.findMany({
      where: { companyId, ...(group ? { group } : {}) },
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  /** Non-sensitive settings safe for employee self-service UI. */
  async getPublicSettings(companyId: string, group?: string) {
    const allowedGroups = new Set(['attendance', 'holidays', 'leave']);
    const blockedKeys = new Set(['attendance.qr_secret']);
    const rows = await this.getSettings(companyId, group);
    return rows.filter(
      (row) => allowedGroups.has(row.group) && !blockedKeys.has(row.key),
    );
  }

  async upsertSetting(
    companyId: string,
    actorId: string,
    key: string,
    value: unknown,
    label?: string,
    group?: string,
  ) {
    const existing = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    const setting = await this.prisma.companySetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: {
        companyId,
        key,
        value: value as Prisma.InputJsonValue,
        label: label ?? key,
        group: group ?? 'general',
        updatedBy: actorId,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        ...(label ? { label } : {}),
        ...(group ? { group } : {}),
        updatedBy: actorId,
      },
    });
    await this.audit.log({
      companyId,
      actorId,
      action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: 'CompanySetting',
      entityId: setting.id,
      metadata: { key, value: value as Prisma.InputJsonValue },
    });
    return setting;
  }

  async updateSettingsBulk(companyId: string, actorId: string, settings: Record<string, unknown>) {
    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      results.push(await this.upsertSetting(companyId, actorId, key, value));
    }
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'CompanySetting',
      metadata: { keys: Object.keys(settings) },
    });
    return results;
  }

  async getPolicies(companyId: string) {
    return this.prisma.companyPolicy.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
  }

  async updatePolicy(companyId: string, actorId: string, code: string, dto: UpdatePolicyDto) {
    const existing = await this.prisma.companyPolicy.findUnique({
      where: { companyId_code: { companyId, code } },
    });
    if (!existing) throw new NotFoundException('Policy not found');

    const policy = await this.prisma.companyPolicy.update({
      where: { id: existing.id },
      data: {
        ...dto,
        version: { increment: 1 },
      },
    });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'CompanyPolicy',
      entityId: policy.id,
      metadata: { code, fields: Object.keys(dto) },
    });
    return policy;
  }
}
