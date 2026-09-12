import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CrmDealStage, CrmFollowUpType, CrmLeadStatus, CrmTaskPriority, CrmTaskStatus } from '@prisma/client';

export class CreateCrmCustomerDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerEmployeeId?: string;
}

export class UpdateCrmCustomerDto extends CreateCrmCustomerDto {}

export class CreateCrmLeadDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ enum: CrmLeadStatus })
  @IsOptional()
  @IsEnum(CrmLeadStatus)
  status?: CrmLeadStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CrmTaskPriority })
  @IsOptional()
  @IsEnum(CrmTaskPriority)
  priority?: CrmTaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextAction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class UpdateCrmLeadDto extends CreateCrmLeadDto {}

export class CreateCrmDealDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ enum: CrmDealStage })
  @IsOptional()
  @IsEnum(CrmDealStage)
  stage?: CrmDealStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCrmDealDto extends CreateCrmDealDto {}

export class CreateCrmFollowUpDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ enum: CrmFollowUpType })
  @IsOptional()
  @IsEnum(CrmFollowUpType)
  type?: CrmFollowUpType;

  @ApiProperty()
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCrmFollowUpDto extends CreateCrmFollowUpDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class CreateCrmNoteDto {
  @ApiProperty()
  @IsString()
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class CreateCrmTaskDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CrmTaskPriority })
  @IsOptional()
  @IsEnum(CrmTaskPriority)
  priority?: CrmTaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiProperty()
  @IsString()
  assignedToEmployeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;
}

export class UpdateCrmTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CrmTaskPriority })
  @IsOptional()
  @IsEnum(CrmTaskPriority)
  priority?: CrmTaskPriority;

  @ApiPropertyOptional({ enum: CrmTaskStatus })
  @IsOptional()
  @IsEnum(CrmTaskStatus)
  status?: CrmTaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class CreateCrmTaskCommentDto {
  @ApiProperty()
  @IsString()
  content!: string;
}

export class ImportCrmLeadsDto {
  @ApiProperty({ type: [CreateCrmLeadDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCrmLeadDto)
  leads!: CreateCrmLeadDto[];
}
