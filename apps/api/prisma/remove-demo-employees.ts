import { EmploymentStatus, PrismaClient, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_CODES = ['EITF001'];
const DEMO_EMAILS = ['mukesh.pandey@eitf.local'];

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  for (const company of companies) {
    const demoEmployees = await prisma.employee.findMany({
      where: {
        companyId: company.id,
        OR: [
          { employeeCode: { in: DEMO_CODES } },
          { email: { in: DEMO_EMAILS } },
          {
            firstName: { equals: 'Mukesh', mode: 'insensitive' },
            lastName: { equals: 'Pandey', mode: 'insensitive' },
          },
        ],
      },
      select: { id: true, employeeCode: true, email: true },
    });

    if (!demoEmployees.length) continue;

    const employeeIds = demoEmployees.map((e) => e.id);

    const demoUsers = await prisma.user.findMany({
      where: {
        companyId: company.id,
        OR: [{ employeeId: { in: employeeIds } }, { email: { in: DEMO_EMAILS } }],
      },
      select: { id: true, email: true },
    });

    const userIds = demoUsers.map((u) => u.id);

    if (userIds.length) {
      await prisma.refreshToken.updateMany({
        where: { userId: { in: userIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await prisma.employee.updateMany({
      where: { id: { in: employeeIds } },
      data: {
        isActive: false,
        status: EmploymentStatus.INACTIVE,
        exitAt: new Date(),
      },
    });

    console.log(
      JSON.stringify({
        ok: true,
        company: company.name,
        deactivatedEmployees: demoEmployees.map((e) => e.employeeCode),
        removedUsers: demoUsers.map((u) => u.email),
      }),
    );
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
