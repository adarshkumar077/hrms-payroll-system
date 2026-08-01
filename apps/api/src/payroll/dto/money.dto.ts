import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LoanAdvanceType,
  ReimbursementStatus,
  SalaryComponentType,
} from '@prisma/client';

export class CreateComponentDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsEnum(SalaryComponentType) type!: SalaryComponentType;
  @IsOptional() @IsBoolean() isTaxable?: boolean;
  @IsOptional() @IsBoolean() isStatutory?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class TemplateLineDto {
  @IsString() componentId!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsNumber() percentOfBasic?: number;
}

export class CreateTemplateDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() grade?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateLineDto)
  lines!: TemplateLineDto[];
}

export class AssignStructureDto {
  @IsString() employeeId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsNumber() @Min(0) ctcAnnual!: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateLineDto)
  lines!: TemplateLineDto[];
  @IsOptional() @IsString() reason?: string;
}

export class GeneratePayrollDto {
  @IsNumber() year!: number;
  @IsNumber() @Min(1) month!: number;
}

export class RequestLoanDto {
  @IsEnum(LoanAdvanceType) type!: LoanAdvanceType;
  @IsNumber() @Min(1) amount!: number;
  @IsNumber() @Min(1) tenureMonths!: number;
  @IsOptional() @IsNumber() interestRate?: number;
  @IsOptional() @IsString() reason?: string;
}

export class ReviewLoanDto {
  @IsString() status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() note?: string;
}

export class SubmitReimbursementDto {
  @IsString() category!: string;
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() receiptUrl?: string;
}

export class ReviewReimbursementDto {
  @IsEnum(ReimbursementStatus) status!: ReimbursementStatus;
  @IsOptional() @IsString() rejectReason?: string;
}
