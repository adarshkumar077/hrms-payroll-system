import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  createGoal(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.growth.createGoal(user, dto);
  }

  @Get('performance/goals')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE)
  listGoals(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('cycleYear') cycleYear?: string,
  ) {
    const canSeeAll = user.roles.some((r) =>
      (['CEO', 'HR', 'MANAGER'] as string[]).includes(r),
    );
    return this.growth.listGoals(
      user.companyId,
      canSeeAll ? employeeId : user.employeeId ?? undefined,
      cycleYear ? Number(cycleYear) : undefined,
    );
  }

  @Post('performance/self-assessment')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR)
  selfAssessment(@CurrentUser() user: AuthUser, @Body() dto: SelfAssessmentDto) {
    return this.growth.selfAssessment(user, dto);
  }

  @Post('performance/manager-review')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  managerReview(@CurrentUser() user: AuthUser, @Body() dto: ManagerReviewDto) {
    return this.growth.managerReview(user, dto);
  }

  @Get('performance/:employeeId/summary')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE)
  summary(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Query('cycleYear') cycleYear?: string,
  ) {
    const id =
      user.employeeId === employeeId ||
      user.roles.some((r) => (['CEO', 'HR', 'MANAGER'] as string[]).includes(r))
        ? employeeId
        : user.employeeId!;
    return this.growth.performanceSummary(
      user.companyId,
      id,
      cycleYear ? Number(cycleYear) : undefined,
    );
  }

  @Get('me/rewards')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO)
  myRewards(@CurrentUser() user: AuthUser) {
    return this.growth.myRewards(user);
  }

  // Training
  @Get('trainings')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE, RoleCode.FINANCE)
  listTrainings(@CurrentUser() user: AuthUser) {
    return this.growth.listTrainings(user.companyId);
  }

  @Post('trainings')
  @Roles(RoleCode.CEO, RoleCode.HR)
  createTraining(@CurrentUser() user: AuthUser, @Body() dto: CreateTrainingDto) {
    return this.growth.createTraining(user, dto);
  }

  @Post('trainings/:id/assign')
  @Roles(RoleCode.CEO, RoleCode.HR)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignTrainingDto,
  ) {
    return this.growth.assignTraining(user, id, dto);
  }

  @Post('trainings/:id/complete')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.EMPLOYEE, RoleCode.MANAGER)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteTrainingDto,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.growth.completeTraining(user, id, dto, employeeId);
  }

  @Get('me/trainings')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO)
  myTrainings(@CurrentUser() user: AuthUser) {
    return this.growth.myTrainings(user);
  }

  @Get('employees/:id/certifications')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE)
  certs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const eid =
      user.employeeId === id ||
      user.roles.some((r) => (['CEO', 'HR', 'MANAGER'] as string[]).includes(r))
        ? id
        : user.employeeId!;
    return this.growth.certifications(user.companyId, eid);
  }

  // Helpdesk
  @Post('tickets')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR)
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.growth.createTicket(user, dto);
  }

  @Get('tickets')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE, RoleCode.FINANCE)
  listTickets(@CurrentUser() user: AuthUser, @Query('mine') mine?: string) {
    return this.growth.listTickets(user, mine === '1');
  }

  @Get('tickets/:id')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE, RoleCode.FINANCE)
  getTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.growth.getTicket(user, id);
  }

  @Post('tickets/:id/comment')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE, RoleCode.FINANCE)
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TicketCommentDto,
  ) {
    return this.growth.comment(user, id, dto);
  }

  @Patch('tickets/:id/status')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.growth.updateTicketStatus(user, id, dto);
  }

  @Post('tickets/:id/escalate')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER)
  escalate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.growth.escalate(user, id);
  }

  @Post('tickets/sla/run')
  @Roles(RoleCode.CEO, RoleCode.HR)
  runSla(@CurrentUser() user: AuthUser) {
    return this.growth.runSlaEscalation(user.companyId);
  }
}
