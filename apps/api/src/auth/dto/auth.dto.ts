import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '9999999999' })
  @IsString()
  @Length(10, 15)
  mobile!: string;

  @ApiPropertyOptional({ description: 'Company slug/id if multi-tenant login; defaults to first active company in Phase 1' })
  @IsOptional()
  @IsString()
  companyId?: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @Length(10, 15)
  mobile!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ description: 'TOTP code if 2FA enabled' })
  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class LoginPasswordDto {
  @ApiPropertyOptional({ description: 'User ID or email address' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  identifier?: string;

  /** @deprecated Use identifier — kept for older web clients */
  @ApiPropertyOptional({ description: 'Legacy alias for identifier' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  email?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class Setup2faDto {
  @ApiProperty()
  @IsString()
  @Length(6, 6)
  totpCode!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  confirmPassword!: string;
}

export class ChangeUsernameDto {
  @ApiProperty({ description: 'New login username (min 5 characters)' })
  @IsString()
  @MinLength(5)
  username!: string;

  @ApiProperty({ description: 'Current password for verification' })
  @IsString()
  currentPassword!: string;
}

export class SetupSuperAdminDto {
  @ApiProperty({ description: 'Email address' })
  @IsString()
  @MinLength(5)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(10, 15)
  mobile!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  confirmPassword!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;
}

export class CreateAdminUserDto {
  @ApiProperty({ description: 'HR email address' })
  @IsString()
  @MinLength(5)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(10, 15)
  mobile!: string;

  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  confirmPassword!: string;

  @ApiProperty({ enum: ['HR'] })
  @IsIn(['HR'])
  role!: 'HR';
}
