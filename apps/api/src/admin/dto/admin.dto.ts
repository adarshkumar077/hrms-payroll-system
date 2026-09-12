import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateManagedUserDto {
  @ApiProperty()
  @IsString()
  loginId!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  confirmPassword!: string;

  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: RoleCode })
  @IsEnum(RoleCode)
  role!: RoleCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class UpdateManagedUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class ResetUserPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}

export class ChangeUserRoleDto {
  @ApiProperty({ enum: RoleCode })
  @IsEnum(RoleCode)
  role!: RoleCode;
}
