import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  AssetType,
  ClearanceItemStatus,
  OnboardingTaskStatus,
  ResignationStatus,
} from '@prisma/client';

export class StartOnboardingDto {
  @IsString() employeeId!: string;
}

export class UpdateOnboardingTaskDto {
  @IsEnum(OnboardingTaskStatus) status!: OnboardingTaskStatus;
  @IsOptional() @IsString() note?: string;
}

export class CreateAssetDto {
  @IsString() assetTag!: string;
  @IsEnum(AssetType) type!: AssetType;
  @IsString() name!: string;
  @IsOptional() @IsString() serialNo?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsNumber() purchaseCost?: number;
  @IsOptional() @IsString() notes?: string;
}

export class AllocateAssetDto {
  @IsString() employeeId!: string;
  @IsOptional() @IsDateString() expectedReturnAt?: string;
}

export class ReturnAssetDto {
  @IsOptional() @IsString() returnCondition?: string;
  @IsOptional() @IsString() returnNote?: string;
}

export class DamageChargeDto {
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() employeeId?: string;
}

export class ResignDto {
  @IsDateString() lastWorkingDay!: string;
  @IsOptional() @IsNumber() noticeDays?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsDateString() resignedAt?: string;
}

export class ReviewResignationDto {
  @IsEnum(ResignationStatus) status!: ResignationStatus;
  @IsOptional() @IsString() note?: string;
}

export class ClearanceStepDto {
  @IsEnum(ClearanceItemStatus) status!: ClearanceItemStatus;
  @IsOptional() @IsString() note?: string;
}

export class ExitInterviewDto {
  @IsObject() answers!: Record<string, unknown>;
}
