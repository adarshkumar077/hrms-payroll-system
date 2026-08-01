import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  AssignmentStatus,
  GoalStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';

export class CreateGoalDto {
  @IsString() employeeId!: string;
  @IsNumber() cycleYear!: number;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() kra?: string;
  @IsOptional() @IsString() kpi?: string;
  @IsOptional() @IsNumber() targetValue?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsEnum(GoalStatus) status?: GoalStatus;
}

export class SelfAssessmentDto {
  @IsNumber() cycleYear!: number;
  @IsString() summary!: string;
  @IsOptional() @IsString() achievements?: string;
  @IsOptional() @IsString() challenges?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(5) selfRating?: number;
}

export class ManagerReviewDto {
  @IsString() employeeId!: string;
  @IsNumber() cycleYear!: number;
  @IsString() feedback!: string;
  @IsNumber() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() strengths?: string;
  @IsOptional() @IsString() improvements?: string;
  @IsOptional() @IsBoolean() recommendPromotion?: boolean;
  @IsOptional() @IsString() proposedDesignation?: string;
  @IsOptional() @IsString() promotionRationale?: string;
}

export class CreateTrainingDto {
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsNumber() durationHrs?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class AssignTrainingDto {
  @IsString() employeeId!: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class CompleteTrainingDto {
  @IsOptional() @IsNumber() score?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() issueCertificate?: boolean;
}

export class CreateTicketDto {
  @IsEnum(TicketCategory) category!: TicketCategory;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsString() subject!: string;
  @IsString() description!: string;
}

export class TicketCommentDto {
  @IsString() body!: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
}

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus) status!: TicketStatus;
  @IsOptional() @IsString() assigneeId?: string;
}
