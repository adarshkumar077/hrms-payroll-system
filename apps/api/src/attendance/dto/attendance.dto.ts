import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { AttendanceDayStatus, AttendanceMethod } from '@prisma/client';

export class MarkAttendanceDto {
  @IsEnum(AttendanceMethod)
  method!: AttendanceMethod;

  @IsOptional() @IsString() punchType?: 'IN' | 'OUT';
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsNumber() accuracyM?: number;
  @IsOptional() @IsString() qrPayload?: string;
  @IsOptional() @IsString() selfieUrl?: string;
  @IsOptional() @IsString() deviceInfo?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() punchedAt?: string;
}

export class CorrectAttendanceDto {
  @IsEnum(AttendanceDayStatus)
  status!: AttendanceDayStatus;

  @IsOptional() @IsDateString() checkInAt?: string;
  @IsOptional() @IsDateString() checkOutAt?: string;
  @IsOptional() @IsString() correctionNote?: string;
  @IsOptional() @IsEnum(AttendanceMethod) method?: AttendanceMethod;
}

export class BiometricWebhookDto {
  @IsString() deviceCode!: string;
  @IsString() employeeCode!: string;
  @IsDateString() punchedAt!: string;
  @IsString() secret!: string;
  @IsOptional() @IsString() punchType?: 'IN' | 'OUT';
}
