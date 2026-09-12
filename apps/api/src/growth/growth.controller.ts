import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { GrowthService } from './growth.service';
import {
  AssignTrainingDto,
  CompleteTrainingDto,
  CreateGoalDto,
  CreateTicketDto,
  CreateTrainingDto,
  ManagerReviewDto,
  SelfAssessmentDto,
  TicketCommentDto,
  UpdateTicketStatusDto,
} from './dto/growth.dto';

@ApiTags('growth')
@ApiBearerAuth()
@Controller()
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  // Performance
  @Post('performance/goals')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  createGoal(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.growth.createGoal(user, dto);
  }

  @Get('performance/goals')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  listGoals(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('cycleYear') cycleYear?: string,
  ) {
    const canSeeAll = user.roles.some((r) =>
      (['SUPER_ADMIN', 'HR', 'ADMIN'] as string[]).includes(r),
    );
    if (!canSeeAll && !user.employeeId) {
      throw new ForbiddenException('No employee profile linked');
    }
    if (!canSeeAll && employeeId && employeeId !== user.employeeId) {
      throw new ForbiddenException('You can only view your own performance goals');
    }
    return this.growth.listGoals(
      user.companyId,
      canSeeAll ? employeeId : user.employeeId ?? undefined,
      cycleYear ? Number(cycleYear) : undefined,
    );
  }

  @Post('performance/self-assessment')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR)
  selfAssessment(@CurrentUser() user: AuthUser, @Body() dto: SelfAssessmentDto) {
    return this.growth.selfAssessment(user, dto);
  }

  @Post('performance/manager-review')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  managerReview(@CurrentUser() user: AuthUser, @Body() dto: ManagerReviewDto) {
    return this.growth.managerReview(user, dto);
  }

  @Get('performance/:employeeId/summary')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  summary(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Query('cycleYear') cycleYear?: string,
  ) {
    const id =
      user.employeeId === employeeId ||
      user.roles.some((r) => (['SUPER_ADMIN', 'HR', 'ADMIN'] as string[]).includes(r))
        ? employeeId
        : user.employeeId!;
    return this.growth.performanceSummary(
      user.companyId,
      id,
      cycleYear ? Number(cycleYear) : undefined,
    );
  }

  @Get('me/rewards')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN)
  myRewards(@CurrentUser() user: AuthUser) {
    return this.growth.myRewards(user);
  }

  // Training
  @Get('trainings')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  listTrainings(@CurrentUser() user: AuthUser) {
    return this.growth.listTrainings(user.companyId);
  }

  @Post('trainings')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  createTraining(@CurrentUser() user: AuthUser, @Body() dto: CreateTrainingDto) {
    return this.growth.createTraining(user, dto);
  }

  @Post('trainings/:id/assign')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignTrainingDto,
  ) {
    return this.growth.assignTraining(user, id, dto);
  }

  @Post('trainings/:id/complete')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteTrainingDto,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.growth.completeTraining(user, id, dto, employeeId);
  }

  @Get('me/trainings')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN)
  myTrainings(@CurrentUser() user: AuthUser) {
    return this.growth.myTrainings(user);
  }

  @Get('employees/:id/certifications')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  certs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const eid =
      user.employeeId === id ||
      user.roles.some((r) => (['SUPER_ADMIN', 'HR', 'ADMIN'] as string[]).includes(r))
        ? id
        : user.employeeId!;
    return this.growth.certifications(user.companyId, eid);
  }

  // Helpdesk
  @Post('tickets')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR)
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.growth.createTicket(user, dto);
  }

  @Get('tickets')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  listTickets(@CurrentUser() user: AuthUser, @Query('mine') mine?: string) {
    return this.growth.listTickets(user, mine === '1');
  }

  @Get('tickets/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  getTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.growth.getTicket(user, id);
  }

  @Post('tickets/:id/comment')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TicketCommentDto,
  ) {
    return this.growth.comment(user, id, dto);
  }

  @Patch('tickets/:id/status')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.growth.updateTicketStatus(user, id, dto);
  }

  @Post('tickets/:id/escalate')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  escalate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.growth.escalate(user, id);
  }

  @Post('tickets/sla/run')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  runSla(@CurrentUser() user: AuthUser) {
    return this.growth.runSlaEscalation(user.companyId);
  }
}
