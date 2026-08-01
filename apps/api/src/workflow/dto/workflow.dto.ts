import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApprovalActionType, WorkflowType } from '@prisma/client';

export class WorkflowStepDto {
  @IsInt() @Min(1) stepOrder!: number;
  @IsString() approverRole!: string;
  @IsOptional() @IsString() label?: string;
}

export class ConfigureWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

export class ActApprovalDto {
  @IsEnum(ApprovalActionType) action!: ApprovalActionType;
  @IsOptional() @IsString() comment?: string;
}

export class StartApprovalDto {
  @IsEnum(WorkflowType) type!: WorkflowType;
  @IsString() entityType!: string;
  @IsString() entityId!: string;
  @IsOptional() @IsString() requesterId?: string;
  @IsOptional() @IsString() summary?: string;
}
