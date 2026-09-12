import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { assertEmployeeScope } from '../common/authorization.util';
import { PayrollService } from './payroll.service';
import {
  AssignStructureDto,
  CreateComponentDto,
  CreateTemplateDto,
  GeneratePayrollDto,
  RequestLoanDto,
  ReviewLoanDto,
  ReviewReimbursementDto,
  SubmitReimbursementDto,
} from './dto/money.dto';

@ApiTags('payroll')
@ApiBearerAuth()
@Controller()
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // Components & CTC — Payment Management is CEO only
  @Get('salary/components')
  @Roles(RoleCode.SUPER_ADMIN)
  listComponents(@CurrentUser() user: AuthUser) {
    return this.payroll.listComponents(user.companyId);
  }

  @Post('salary/components')
  @Roles(RoleCode.SUPER_ADMIN)
  createComponent(@CurrentUser() user: AuthUser, @Body() dto: CreateComponentDto) {
    return this.payroll.createComponent(user, dto);
  }

  @Get('salary/templates')
  @Roles(RoleCode.SUPER_ADMIN)
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.payroll.listTemplates(user.companyId);
  }

  @Post('salary/templates')
  @Roles(RoleCode.SUPER_ADMIN)
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.payroll.createTemplate(user, dto);
  }

  @Post('salary/structures')
  @Roles(RoleCode.SUPER_ADMIN)
  assignStructure(@CurrentUser() user: AuthUser, @Body() dto: AssignStructureDto) {
    return this.payroll.assignStructure(user, dto);
  }

  @Get('salary/structures/:employeeId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  getStructure(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.payroll.getStructure(user, employeeId);
  }

  @Get('salary/revisions/:employeeId')
  @Roles(RoleCode.SUPER_ADMIN)
  revisions(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.payroll.revisions(user.companyId, employeeId);
  }

  // Payroll runs — CEO only
  @Get('payroll/runs')
  @Roles(RoleCode.SUPER_ADMIN)
  listRuns(@CurrentUser() user: AuthUser) {
    return this.payroll.listRuns(user.companyId);
  }

  @Get('payroll/runs/:id')
  @Roles(RoleCode.SUPER_ADMIN)
  getRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.getRun(user.companyId, id);
  }

  @Post('payroll/generate')
  @Roles(RoleCode.SUPER_ADMIN)
  generate(@CurrentUser() user: AuthUser, @Body() dto: GeneratePayrollDto) {
    return this.payroll.generate(user, dto);
  }

  @Post('payroll/runs/:id/approve')
  @Roles(RoleCode.SUPER_ADMIN)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.approve(user, id);
  }

  @Post('payroll/lines/:id/paid')
  @Roles(RoleCode.SUPER_ADMIN)
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.markPaid(user, id);
  }

  @Get('payroll/my-payslips')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  myPayslips(@CurrentUser() user: AuthUser) {
    return this.payroll.myPayslips(user);
  }

  @Get('payroll/my-payslips/:id')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  myPayslip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.myPayslip(user, id);
  }

  // ESD
  @Get('esd/sheet')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  esdSheet(@CurrentUser() user: AuthUser) {
    return this.payroll.esdSheet(user.companyId);
  }

  @Get('esd/:employeeId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.EMPLOYEE)
  esdBalance(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    assertEmployeeScope(user, employeeId, 'You can only view your own ESD balance');
    return this.payroll.esdBalance(user.companyId, employeeId);
  }

  // Loans
  @Post('loans')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR)
  requestLoan(@CurrentUser() user: AuthUser, @Body() dto: RequestLoanDto) {
    return this.payroll.requestLoan(user, dto);
  }

  @Get('loans/mine')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  myLoans(@CurrentUser() user: AuthUser) {
    return this.payroll.myLoans(user);
  }

  @Get('loans/queue')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  loanQueue(@CurrentUser() user: AuthUser) {
    return this.payroll.loanQueue(user.companyId);
  }

  @Get('loans/sheet')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  loanSheet(@CurrentUser() user: AuthUser) {
    return this.payroll.loanSheet(user.companyId);
  }

  @Post('loans/:id/review')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  reviewLoan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewLoanDto,
  ) {
    return this.payroll.reviewLoan(user, id, dto);
  }

  // Reimbursements
  @Post('reimbursements')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR)
  submitReimbursement(@CurrentUser() user: AuthUser, @Body() dto: SubmitReimbursementDto) {
    return this.payroll.submitReimbursement(user, dto);
  }

  @Get('reimbursements/mine')
  @Roles(RoleCode.EMPLOYEE, RoleCode.ADMIN, RoleCode.HR, RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  myReimbursements(@CurrentUser() user: AuthUser) {
    return this.payroll.myReimbursements(user);
  }

  @Get('reimbursements/queue')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  reimbursementQueue(@CurrentUser() user: AuthUser) {
    return this.payroll.reimbursementQueue(user.companyId);
  }

  @Post('reimbursements/:id/review')
  @Roles(RoleCode.SUPER_ADMIN)
  reviewReimbursement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewReimbursementDto,
  ) {
    return this.payroll.reviewReimbursement(user, id, dto);
  }
}
