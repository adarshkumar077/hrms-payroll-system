import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PT_STATE_CODES } from '../../payroll/statutory/defaults';

export class ToggleDeductionDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(['percent', 'fixed', 'statutory']) mode?: 'percent' | 'fixed' | 'statutory';
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsNumber() amount?: number;
}

export class EsdDeductionDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsIn(['monthly', 'one_time', 'custom']) type?: 'monthly' | 'one_time' | 'custom';
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @IsNumber() @Min(0) deductedToDate?: number;
}

export class CustomDeductionDto {
  @IsString() name!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() description?: string;
}

export class CustomAllowanceDto {
  @IsString() name!: string;
  @IsNumber() @Min(0) amount!: number;
}

export class AllowancesDto {
  @IsOptional() @IsNumber() basic?: number;
  @IsOptional() @IsNumber() hra?: number;
  @IsOptional() @IsNumber() medical?: number;
  @IsOptional() @IsNumber() travel?: number;
  @IsOptional() @IsNumber() internet?: number;
  @IsOptional() @IsNumber() overtime?: number;
  @IsOptional() @IsNumber() bonus?: number;
  @IsOptional() @IsNumber() incentive?: number;
  @IsOptional() @IsNumber() special?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomAllowanceDto)
  custom?: CustomAllowanceDto[];
}

export class DeductionsDto {
  @IsOptional() @ValidateNested() @Type(() => ToggleDeductionDto) pf?: ToggleDeductionDto;
  @IsOptional() @ValidateNested() @Type(() => ToggleDeductionDto) tds?: ToggleDeductionDto;
  @IsOptional() @ValidateNested() @Type(() => ToggleDeductionDto) esi?: ToggleDeductionDto;
  @IsOptional() @ValidateNested() @Type(() => EsdDeductionDto) esd?: EsdDeductionDto;
  @IsOptional() @ValidateNested() @Type(() => ToggleDeductionDto) professionalTax?: ToggleDeductionDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomDeductionDto)
  custom?: CustomDeductionDto[];
}

export class PayrollConfigBodyDto {
  @IsNumber() @Min(0) grossMonthly!: number;
  @IsOptional() @IsNumber() @Min(0) dailySalary?: number;
  @IsOptional() @IsNumber() @Min(0) hourlySalary?: number;
  @IsOptional() @IsIn(['MONTHLY', 'DAILY']) salaryType?: 'MONTHLY' | 'DAILY';
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsNumber() @Min(1) workingDays?: number;
  @IsObject() @ValidateNested() @Type(() => AllowancesDto) allowances!: AllowancesDto;
  @IsObject() @ValidateNested() @Type(() => DeductionsDto) deductions!: DeductionsDto;
  /** Stored on the employee: income-tax regime for TDS. */
  @IsOptional() @IsIn(['NEW', 'OLD']) taxRegime?: 'NEW' | 'OLD';
  /** Stored on the employee: old-regime declared annual deductions (80C etc.) total. */
  @IsOptional() @IsNumber() @Min(0) oldRegimeDeclaredDeductions?: number;
  /** Stored on the employee: professional-tax state code (MH, KA, WB, TN, TS, AP, GJ, NONE). */
  @IsOptional() @IsIn([...PT_STATE_CODES]) ptState?: string;
}
