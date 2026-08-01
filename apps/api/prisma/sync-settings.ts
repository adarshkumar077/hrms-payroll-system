import { PrismaClient, Prisma } from '@prisma/client';
import { DEFAULT_COMPANY_SETTINGS } from '../src/company/default-settings';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    for (const setting of DEFAULT_COMPANY_SETTINGS) {
      await prisma.companySetting.upsert({
        where: { companyId_key: { companyId: company.id, key: setting.key } },
        create: {
          companyId: company.id,
          key: setting.key,
          value: setting.value as Prisma.InputJsonValue,
          label: setting.label,
          group: setting.group,
        },
        update: {
          // Update policy defaults that must match product rules
          ...(
            [
              'office.work_start',
              'office.grace_minutes',
              'attendance.ulob_threshold',
              'attendance.ulob_absent_days',
              'incentive.amount',
              'incentive.require_no_half_day',
              'incentive.require_no_absent',
              'incentive.require_no_ulob',
              'esd.enabled',
              'esd.monthly_amount',
              'weekly_off.paid_saturday',
              'weekly_off.extra_day_pay_on_work',
              'leave.expire_enabled',
              'leave.carry_forward_max',
            ].includes(setting.key)
              ? {
                  value: setting.value as Prisma.InputJsonValue,
                  label: setting.label,
                  group: setting.group,
                }
              : { label: setting.label, group: setting.group }
          ),
        },
      });
    }
    console.log(`Synced settings for company ${company.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
