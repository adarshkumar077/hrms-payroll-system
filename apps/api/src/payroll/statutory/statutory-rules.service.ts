import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { financialYearOf } from './common';
import { DEFAULT_FINANCIAL_YEARS, defaultStatutoryRules, PT_STATE_CODES } from './defaults';
import { parseStatutoryRules, StatutoryRules, StatutoryRulesError } from './types';

export type ResolvedRules = {
  rules: StatutoryRules;
  source: 'DATABASE' | 'DEFAULT';
  verifyWithCA: boolean;
  id?: string;
  updatedAt?: Date;
};

@Injectable()
export class StatutoryRulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active rules for a company and FY. Falls back to the built-in defaults when no row exists.
   * A stored row that fails validation is an error (never silently replaced by defaults).
   */
  async getRules(companyId: string, financialYear: string): Promise<ResolvedRules> {
    const row = await this.prisma.statutoryRuleSet.findUnique({
      where: { companyId_financialYear: { companyId, financialYear } },
    });
    if (!row || !row.isActive) {
      const rules = defaultStatutoryRules(financialYear);
      return { rules, source: 'DEFAULT', verifyWithCA: true };
    }
    try {
      const rules = parseStatutoryRules(row.rules);
      return {
        rules: { ...rules, financialYear },
        source: 'DATABASE',
        verifyWithCA: row.verifyWithCA || rules.verifyWithCA,
        id: row.id,
        updatedAt: row.updatedAt,
      };
    } catch (e) {
      if (e instanceof StatutoryRulesError) {
        throw new BadRequestException(`Statutory rules for FY ${financialYear} are invalid: ${e.message}`);
      }
      throw e;
    }
  }

  getRulesForMonth(companyId: string, year: number, month: number) {
    return this.getRules(companyId, financialYearOf(year, month));
  }

  /** Read-only view for the payroll settings screen. */
  async view(companyId: string, financialYear?: string) {
    const now = new Date();
    const current = financialYearOf(now.getFullYear(), now.getMonth() + 1);
    const fy = financialYear && /^\d{4}-\d{2}$/.test(financialYear) ? financialYear : current;
    const rows = await this.prisma.statutoryRuleSet.findMany({
      where: { companyId },
      select: { financialYear: true, isActive: true, verifyWithCA: true, updatedAt: true },
      orderBy: { financialYear: 'asc' },
    });
    const years = [...new Set([...DEFAULT_FINANCIAL_YEARS, ...rows.map((r) => r.financialYear), current])].sort();
    const resolved = await this.getRules(companyId, fy);
    return {
      financialYear: fy,
      currentFinancialYear: current,
      availableYears: years,
      source: resolved.source,
      verifyWithCA: resolved.verifyWithCA,
      updatedAt: resolved.updatedAt ?? null,
      ptStates: PT_STATE_CODES,
      rules: resolved.rules,
    };
  }
}
