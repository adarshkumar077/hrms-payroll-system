import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HolidayScope, HolidayType } from '@prisma/client';

export class CreateHolidayDto {
  @IsString() name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsEnum(HolidayType) type?: HolidayType;
  @IsOptional() @IsEnum(HolidayScope) scope?: HolidayScope;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() lastSaturdayOverride?: boolean;
  @IsOptional() @IsBoolean() repeatYearly?: boolean;
  @IsOptional() @IsString() dayStatus?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class UpdateHolidayDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(HolidayType) type?: HolidayType;
  @IsOptional() @IsEnum(HolidayScope) scope?: HolidayScope;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() lastSaturdayOverride?: boolean;
  @IsOptional() @IsBoolean() repeatYearly?: boolean;
  @IsOptional() @IsString() dayStatus?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
  @IsOptional() @IsString() notes?: string;
}

/** Quick Action Bar on Attendance Sheet */
export class QuickAttendanceDto {
  @IsDateString() date!: string;
  @IsString()
  @IsIn(['PH', 'WO', 'FESTIVAL', 'OFFICE', 'HD', 'WORK', 'PAID_HOLIDAY', 'WEEKLY_OFF', 'FESTIVAL_HOLIDAY', 'OFFICE_HOLIDAY', 'HALF_DAY', 'WORKING_DAY'])
  status!: string;
  @IsString() title!: string;
  @IsIn(['Paid', 'Unpaid', 'paid', 'unpaid'])
  payment!: string;
  @IsOptional() @IsIn(['ONE_TIME', 'YEARLY', 'one_time', 'yearly'])
  repeat?: string;
  @IsOptional() @IsString() id?: string;
}

export class HolidayImportRowDto {
  @IsDateString() date!: string;
  @IsString() title!: string;
  @IsString() status!: string;
  @IsIn(['Paid', 'Unpaid', 'paid', 'unpaid']) payment!: string;
  @IsOptional() @IsIn(['ONE_TIME', 'YEARLY', 'one_time', 'yearly']) repeat?: string;
}

export class HolidayImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolidayImportRowDto)
  rows!: HolidayImportRowDto[];
}
