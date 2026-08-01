import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateShiftDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() name!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsInt() breakMinutes?: number;
  @IsOptional() @IsInt() graceMinutes?: number;
  @IsOptional() @IsBoolean() isOvernight?: boolean;
  @IsOptional() @IsInt() overtimeAfterMinutes?: number;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsInt() breakMinutes?: number;
  @IsOptional() @IsInt() graceMinutes?: number;
  @IsOptional() @IsBoolean() isOvernight?: boolean;
  @IsOptional() @IsInt() overtimeAfterMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignShiftDto {
  @IsString() employeeId!: string;
  @IsString() shiftId!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() notes?: string;
}

export class BulkAssignShiftDto {
  @IsString() shiftId!: string;
  @IsDateString() date!: string;
  @IsArray() @IsString({ each: true }) employeeIds!: string[];
}

export class ShiftChangeRequestDto {
  @IsDateString() date!: string;
  @IsString() toShiftId!: string;
  @IsOptional() @IsString() reason?: string;
}

export class ReviewShiftChangeDto {
  @IsString() status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reviewNote?: string;
}
