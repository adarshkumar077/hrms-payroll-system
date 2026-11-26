import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { isPrivileged } from '../common/authorization.util';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode, WorkflowType } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { WorkflowService } from './workflow.service';
import { ActApprovalDto, ConfigureWorkflowDto } from './dto/workflow.dto';

@ApiTags('workflow')
@ApiBearerAuth()
@Controller()
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('workflows')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  list(@CurrentUser() user: AuthUser) {
    return this.workflow.listWorkflows(user.companyId);
  }

  @Get('workflows/:type')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  getOne(@CurrentUser() user: AuthUser, @Param('type') type: string) {
    return this.workflow.getConfig(user.companyId, type.toUpperCase() as WorkflowType);
  }

  @Post('workflows/:type/config')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  configure(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: ConfigureWorkflowDto,
  ) {
    return this.workflow.configure(user, type.toUpperCase() as WorkflowType, dto);
  }

  @Get('approvals/pending')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  pending(@CurrentUser() user: AuthUser) {
    return this.workflow.listPending(user);
  }

  @Get('approvals/mine')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  mine(@CurrentUser() user: AuthUser) {
    return this.workflow.listMine(user);
  }

  @Get('approvals/history')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  history(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.workflow.listHistory(user.companyId, status);
  }

  @Get('approvals/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.workflow.getInstance(user.companyId, id);
    // Visible to privileged users, the requester, and whoever may act on the current step.
    const step = row.workflow.steps.find((s) => s.stepOrder === row.currentStepOrder);
    const isCurrentApprover = Boolean(step && user.roles.includes(step.approverRole.toUpperCase()));
    const isRequester = Boolean(user.employeeId && row.requesterId === user.employeeId);
    if (!isPrivileged(user) && !isRequester && !isCurrentApprover) {
      throw new ForbiddenException('You can only view your own requests');
    }
    return row;
  }

  @Post('approvals/:instanceId/act')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  act(
    @CurrentUser() user: AuthUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: ActApprovalDto,
  ) {
    return this.workflow.act(user, instanceId, dto);
  }
}
