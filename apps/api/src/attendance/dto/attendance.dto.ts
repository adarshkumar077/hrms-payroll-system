import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { AttendanceDayStatus, AttendanceMethod } from '@prisma/client';

export class MarkAttendanceDto {
  @IsEnum(AttendanceMethod)
  method!: AttendanceMethod;

  @IsOptional() @IsIn(['IN', 'OUT']) punchType?: 'IN' | 'OUT';
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsNumber() accuracyM?: number;
  @IsOptional() @IsString() qrPayload?: string;
  /** Required for employee self-service (SELFIE/WEB) — validated in service */
  @IsOptional() @IsString() selfieUrl?: string;
  @IsOptional() @IsString() deviceInfo?: string;
  /** Required for employee self-service — validated in service */
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() mapsUrl?: string;
  /** When true, enforce selfie + GPS + address even for other methods */
  @IsOptional() @IsBoolean() requireGps?: boolean;
  @IsOptional() @IsDateString() punchedAt?: string;
}

export class CorrectAttendanceDto {
  @IsEnum(AttendanceDayStatus)
  status!: AttendanceDayStatus;

  @IsOptional() @IsDateString() checkInAt?: string;
  @IsOptional() @IsDateString() checkOutAt?: string;
  @IsOptional() @IsString() correctionNote?: string;
  @IsOptional() @IsEnum(AttendanceMethod) method?: AttendanceMethod;
  @IsOptional() @IsNumber() overtimeMinutes?: number;
  @IsOptional() @IsNumber() todaysEarnings?: number;
  @IsOptional() @IsString() checkInAddress?: string;
  @IsOptional() @IsString() checkOutAddress?: string;
  @IsOptional() @IsString() checkInMapsUrl?: string;
  @IsOptional() @IsString() checkOutMapsUrl?: string;
  @IsOptional() @IsString() checkInSelfieUrl?: string;
  @IsOptional() @IsString() checkOutSelfieUrl?: string;
  @IsOptional() @IsString() checkOutSource?: string;
}

/** HR manual mark — no selfie/GPS required */
export class ManualMarkDto {
  @IsString()
  employeeId!: string;

  @IsIn(['IN', 'OUT'])
  punchType!: 'IN' | 'OUT';

  @IsOptional()
  @IsEnum(AttendanceMethod)
  method?: AttendanceMethod;

  @IsOptional() @IsDateString() punchedAt?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() mapsUrl?: string;
}

export class BiometricWebhookDto {
  @IsString() deviceCode!: string;
  @IsString() employeeCode!: string;
  @IsDateString() punchedAt!: string;
  @IsString() secret!: string;
  @IsOptional() @IsString() punchType?: 'IN' | 'OUT';
}
