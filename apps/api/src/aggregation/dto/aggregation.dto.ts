import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class SendNotificationDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() link?: string;
  @IsOptional() channels?: NotificationChannel[];
}

export class CreateAnnouncementDto {
  @IsString() @MaxLength(200) title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() audience?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

export class MarkReadDto {
  @IsOptional() @IsBoolean() all?: boolean;
}
