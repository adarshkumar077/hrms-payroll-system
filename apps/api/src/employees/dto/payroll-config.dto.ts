import {
  IsArray,
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

export class ToggleDeductionDto {
  @IsOptional() enabled?: boolean;
  @IsOptional() @IsIn(['percent', 'fixed']) mode?: 'percent' | 'fixed';
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsNumber() amount?: number;
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
  @IsOptional() @ValidateNested() @Type(() => ToggleDeductionDto) esd?: ToggleDeductionDto;
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
}
