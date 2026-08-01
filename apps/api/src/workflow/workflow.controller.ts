import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.FINANCE)
  list(@CurrentUser() user: AuthUser) {
    return this.workflow.listWorkflows(user.companyId);
  }

  @Get('workflows/:type')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.FINANCE)
  getOne(@CurrentUser() user: AuthUser, @Param('type') type: string) {
    return this.workflow.getConfig(user.companyId, type.toUpperCase() as WorkflowType);
  }

  @Post('workflows/:type/config')
  @Roles(RoleCode.CEO, RoleCode.HR)
  configure(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: ConfigureWorkflowDto,
  ) {
    return this.workflow.configure(user, type.toUpperCase() as WorkflowType, dto);
  }

  @Get('approvals/pending')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.FINANCE)
  pending(@CurrentUser() user: AuthUser) {
    return this.workflow.listPending(user);
  }

  @Get('approvals/mine')
  @Roles(RoleCode.EMPLOYEE, RoleCode.MANAGER, RoleCode.HR, RoleCode.CEO, RoleCode.FINANCE)
  mine(@CurrentUser() user: AuthUser) {
    return this.workflow.listMine(user);
  }

  @Get('approvals/history')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.FINANCE)
  history(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.workflow.listHistory(user.companyId, status);
  }

  @Get('approvals/:id')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.FINANCE, RoleCode.EMPLOYEE)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.getInstance(user.companyId, id);
  }

  @Post('approvals/:instanceId/act')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.FINANCE)
  act(
    @CurrentUser() user: AuthUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: ActApprovalDto,
  ) {
    return this.workflow.act(user, instanceId, dto);
  }
}
