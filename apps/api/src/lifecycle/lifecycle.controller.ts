import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { assertEmployeeScope } from '../common/authorization.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { LifecycleService } from './lifecycle.service';
import {
  AllocateAssetDto,
  ClearanceStepDto,
  CreateAssetDto,
  DamageChargeDto,
  ExitInterviewDto,
  ResignDto,
  ReturnAssetDto,
  ReviewResignationDto,
  StartOnboardingDto,
  UpdateOnboardingTaskDto,
} from './dto/lifecycle.dto';

@ApiTags('lifecycle')
@ApiBearerAuth()
@Controller()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post('onboarding/start')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  start(@CurrentUser() user: AuthUser, @Body() dto: StartOnboardingDto) {
    return this.lifecycle.startOnboarding(user.companyId, dto.employeeId, user.id);
  }

  @Get('onboarding')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  list(@CurrentUser() user: AuthUser) {
    return this.lifecycle.listOnboarding(user.companyId);
  }

  @Get('onboarding/:employeeId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  getOne(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    assertEmployeeScope(user, employeeId, 'You can only view your own onboarding record');
    return this.lifecycle.getOnboarding(user.companyId, employeeId);
  }

  @Patch('onboarding/:id/task/:taskId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateOnboardingTaskDto,
  ) {
    return this.lifecycle.updateTask(user, id, taskId, dto);
  }

  @Get('assets')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  listAssets(@CurrentUser() user: AuthUser) {
    return this.lifecycle.listAssets(user.companyId);
  }

  @Post('assets')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  createAsset(@CurrentUser() user: AuthUser, @Body() dto: CreateAssetDto) {
    return this.lifecycle.createAsset(user, dto);
  }

  @Post('assets/:id/allocate')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  allocate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AllocateAssetDto,
  ) {
    return this.lifecycle.allocate(user, id, dto);
  }

  @Post('assets/:id/return')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  returnAsset(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReturnAssetDto,
  ) {
    return this.lifecycle.returnAsset(user, id, dto);
  }

  @Post('assets/:id/damage-charge')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  damage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DamageChargeDto,
  ) {
    return this.lifecycle.damageCharge(user, id, dto);
  }

  @Get('me/assets')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN)
  myAssets(@CurrentUser() user: AuthUser) {
    return this.lifecycle.myAssets(user);
  }

  @Post('exit/resign')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR)
  resign(@CurrentUser() user: AuthUser, @Body() dto: ResignDto) {
    return this.lifecycle.resign(user, dto);
  }

  @Get('exit')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  listExit(@CurrentUser() user: AuthUser) {
    return this.lifecycle.listResignations(user.companyId);
  }

  @Get('exit/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  getExit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.getResignation(user.companyId, id);
  }

  @Post('exit/:id/review')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  reviewExit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewResignationDto,
  ) {
    return this.lifecycle.reviewResignation(user, id, dto);
  }

  @Post('exit/:id/clearance/:step')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  clearance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: ClearanceStepDto,
  ) {
    return this.lifecycle.clearanceStep(user, id, step, dto);
  }

  @Post('exit/:id/exit-interview')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.EMPLOYEE, RoleCode.ADMIN)
  interview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExitInterviewDto,
  ) {
    return this.lifecycle.exitInterview(user, id, dto);
  }

  @Post('exit/:id/documents')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', example: 'leaving_letter' },
      },
    },
  })
  uploadExitDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type?: string,
  ) {
    return this.lifecycle.uploadExitDocument(user, id, file, type);
  }

  @Post('exit/:id/fnf/generate')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  generateFnf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.generateFnf(user, id);
  }

  @Post('exit/:id/fnf/finalize')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  finalizeFnf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.finalizeFnf(user, id);
  }

  @Get('exit/:id/fnf')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  async getFnf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const r = await this.lifecycle.getResignation(user.companyId, id);
    return r.fnf;
  }

  @Get('exit/:id/experience-letter')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  experience(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.letter(user, id, 'experience');
  }

  @Get('exit/:id/relieving-letter')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  relieving(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.letter(user, id, 'relieving');
  }
}
