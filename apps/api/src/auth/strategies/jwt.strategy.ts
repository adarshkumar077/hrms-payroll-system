import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

type JwtPayload = {
  sub: string;
  companyId: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-32chars'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        companyId: payload.companyId,
        status: { in: ['ACTIVE', 'PENDING_PASSWORD_CHANGE'] },
      },
      include: {
        userRoles: { include: { role: true } },
        moduleAccess: true,
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      mobile: user.mobile,
      displayName: user.displayName,
      roles: user.userRoles.filter((ur) => ur.role).map((ur) => ur.role!.code),
      employeeId: user.employeeId,
      moduleAccess: user.moduleAccess.filter((m) => m.canAccess).map((m) => m.moduleKey),
    };
  }
}
