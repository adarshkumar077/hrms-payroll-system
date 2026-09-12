import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CrmDealStage, CrmLeadStatus, CrmTaskStatus, RoleCode } from '@prisma/client';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { CrmService } from './crm.service';
import {
  CreateCrmCustomerDto,
  CreateCrmDealDto,
  CreateCrmFollowUpDto,
  CreateCrmLeadDto,
  CreateCrmNoteDto,
  CreateCrmTaskCommentDto,
  CreateCrmTaskDto,
  ImportCrmLeadsDto,
  UpdateCrmCustomerDto,
  UpdateCrmDealDto,
  UpdateCrmFollowUpDto,
  UpdateCrmLeadDto,
  UpdateCrmTaskDto,
} from './dto/crm.dto';

const CRM_ADMIN = [RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN];
const CRM_ALL = [...CRM_ADMIN, RoleCode.EMPLOYEE];

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('dashboard')
  @Roles(...CRM_ADMIN)
  dashboard(@CurrentUser() user: AuthUser) {
    return this.crm.dashboardStats(user);
  }

  @Get('reports/sales')
  @Roles(...CRM_ADMIN)
  salesReport(@CurrentUser() user: AuthUser) {
    return this.crm.salesReport(user);
  }

  @Get('customers')
  @Roles(...CRM_ADMIN)
  listCustomers(@CurrentUser() user: AuthUser) {
    return this.crm.listCustomers(user);
  }

  @Post('customers')
  @Roles(...CRM_ADMIN)
  createCustomer(@CurrentUser() user: AuthUser, @Body() dto: CreateCrmCustomerDto) {
    return this.crm.createCustomer(user, dto);
  }

  @Patch('customers/:id')
  @Roles(...CRM_ADMIN)
  updateCustomer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmCustomerDto,
  ) {
    return this.crm.updateCustomer(user, id, dto);
  }

  @Delete('customers/:id')
  @Roles(...CRM_ADMIN)
  deleteCustomer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.deleteCustomer(user, id);
  }

  @Get('leads')
  @Roles(...CRM_ALL)
  listLeads(@CurrentUser() user: AuthUser, @Query('status') status?: CrmLeadStatus) {
    return this.crm.listLeads(user, status);
  }

  @Post('leads')
  @Roles(...CRM_ADMIN)
  createLead(@CurrentUser() user: AuthUser, @Body() dto: CreateCrmLeadDto) {
    return this.crm.createLead(user, dto);
  }

  @Post('leads/import')
  @Roles(...CRM_ADMIN)
  importLeads(@CurrentUser() user: AuthUser, @Body() dto: ImportCrmLeadsDto) {
    return this.crm.importLeads(user, dto.leads);
  }

  @Get('leads/export/:format')
  @Roles(...CRM_ADMIN)
  async exportLeads(
    @CurrentUser() user: AuthUser,
    @Param('format') format: 'csv' | 'xlsx' | 'pdf',
    @Res() res: Response,
  ) {
    const file = await this.crm.exportLeads(user, format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    if (Buffer.isBuffer(file.content)) {
      res.send(file.content);
    } else {
      res.send(file.content);
    }
  }

  @Get('leads/:id')
  @Roles(...CRM_ALL)
  getLead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.getLead(user, id);
  }

  @Get('leads/:id/activities')
  @Roles(...CRM_ALL)
  listLeadActivities(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.listLeadActivities(user, id);
  }

  @Patch('leads/:id')
  @Roles(...CRM_ALL)
  updateLead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmLeadDto,
  ) {
    return this.crm.updateLead(user, id, dto);
  }

  @Delete('leads/:id')
  @Roles(...CRM_ADMIN)
  deleteLead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.deleteLead(user, id);
  }

  @Get('deals')
  @Roles(...CRM_ADMIN)
  listDeals(@CurrentUser() user: AuthUser, @Query('stage') stage?: CrmDealStage) {
    return this.crm.listDeals(user, stage);
  }

  @Post('deals')
  @Roles(...CRM_ADMIN)
  createDeal(@CurrentUser() user: AuthUser, @Body() dto: CreateCrmDealDto) {
    return this.crm.createDeal(user, dto);
  }

  @Patch('deals/:id')
  @Roles(...CRM_ADMIN)
  updateDeal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmDealDto,
  ) {
    return this.crm.updateDeal(user, id, dto);
  }

  @Delete('deals/:id')
  @Roles(...CRM_ADMIN)
  deleteDeal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.deleteDeal(user, id);
  }

  @Get('follow-ups')
  @Roles(...CRM_ADMIN)
  listFollowUps(@CurrentUser() user: AuthUser, @Query('today') today?: string) {
    return this.crm.listFollowUps(user, today === '1');
  }

  @Post('follow-ups')
  @Roles(...CRM_ADMIN)
  createFollowUp(@CurrentUser() user: AuthUser, @Body() dto: CreateCrmFollowUpDto) {
    return this.crm.createFollowUp(user, dto);
  }

  @Patch('follow-ups/:id')
  @Roles(...CRM_ADMIN)
  updateFollowUp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmFollowUpDto,
  ) {
    return this.crm.updateFollowUp(user, id, dto);
  }

  @Post('follow-ups/:id/complete')
  @Roles(...CRM_ADMIN)
  completeFollowUp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.completeFollowUp(user, id);
  }

  @Delete('follow-ups/:id')
  @Roles(...CRM_ADMIN)
  deleteFollowUp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.deleteFollowUp(user, id);
  }

  @Get('notes')
  @Roles(...CRM_ADMIN)
  listNotes(@CurrentUser() user: AuthUser) {
    return this.crm.listNotes(user);
  }

  @Post('notes')
  @Roles(...CRM_ADMIN)
  createNote(@CurrentUser() user: AuthUser, @Body() dto: CreateCrmNoteDto) {
    return this.crm.createNote(user, dto);
  }

  @Delete('notes/:id')
  @Roles(...CRM_ADMIN)
  deleteNote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.deleteNote(user, id);
  }

  @Get('tasks')
  @Roles(...CRM_ALL)
  listTasks(@CurrentUser() user: AuthUser, @Query('status') status?: CrmTaskStatus) {
    return this.crm.listTasks(user, status);
  }

  @Post('tasks')
  @Roles(...CRM_ADMIN)
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateCrmTaskDto) {
    return this.crm.createTask(user, dto);
  }

  @Patch('tasks/:id')
  @Roles(...CRM_ALL)
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmTaskDto,
  ) {
    return this.crm.updateTask(user, id, dto);
  }

  @Post('tasks/:id/verify')
  @Roles(...CRM_ADMIN)
  verifyTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.verifyTask(user, id);
  }

  @Post('tasks/:id/comments')
  @Roles(...CRM_ALL)
  addTaskComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCrmTaskCommentDto,
  ) {
    return this.crm.addTaskComment(user, id, dto);
  }
}
