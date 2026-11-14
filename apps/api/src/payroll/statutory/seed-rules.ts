import { Prisma, PrismaClient } from '@prisma/client';
import { allDefaultStatutoryRules } from './defaults';

/**
 * Idempotently create the default statutory rule sets (FY 2025-26, FY 2026-27) for a company.
 * Existing rows are never overwritten, so a CA-verified edit survives re-seeding.
 */
export async function seedStatutoryRuleSets(
  prisma: Pick<PrismaClient, 'statutoryRuleSet'>,
  companyId: string,
): Promise<number> {
  let created = 0;
  for (const rules of allDefaultStatutoryRules()) {
    const existing = await prisma.statutoryRuleSet.findUnique({
      where: { companyId_financialYear: { companyId, financialYear: rules.financialYear } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.statutoryRuleSet.create({
      data: {
        companyId,
        financialYear: rules.financialYear,
        rules: rules as unknown as Prisma.InputJsonValue,
        verifyWithCA: true,
        notes: 'Seeded defaults — verify with your CA before go-live.',
      },
    });
    created += 1;
  }
  return created;
}
