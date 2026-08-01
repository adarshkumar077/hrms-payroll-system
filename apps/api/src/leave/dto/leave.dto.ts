import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LeaveApplicationStatus } from '@prisma/client';

export class ApplyLeaveDto {
  @IsString() leaveTypeId!: string;
  @IsDateString() fromDate!: string;
  @IsDateString() toDate!: string;
  @IsOptional() @IsBoolean() isHalfDay?: boolean;
  @IsOptional() @IsString() halfDaySession?: 'FIRST' | 'SECOND';
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() otherTypeNote?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
}

export class ReviewLeaveDto {
  @IsEnum(LeaveApplicationStatus) status!: LeaveApplicationStatus;
  @IsOptional() @IsString() comment?: string;
}

export class EncashLeaveDto {
  @IsString() leaveTypeId!: string;
  @IsNumber() @Min(0.5) days!: number;
  @IsOptional() @IsString() note?: string;
}

export class AdjustBalanceDto {
  @IsString() employeeId!: string;
  @IsString() leaveTypeId!: string;
  @IsNumber() days!: number;
  @IsOptional() @IsString() note?: string;
}
