import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { HolidayScope, HolidayType } from '@prisma/client';

export class CreateHolidayDto {
  @IsString() name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsEnum(HolidayType) type?: HolidayType;
  @IsOptional() @IsEnum(HolidayScope) scope?: HolidayScope;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
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
  @IsOptional() @IsArray() @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
  @IsOptional() @IsString() notes?: string;
}
