import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentStatus } from '@prisma/client';

export class PersonalDto {
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() fatherName?: string;
  @IsOptional() @IsString() motherName?: string;
  @IsOptional() @IsString() spouseName?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() permanentLine1?: string;
  @IsOptional() @IsString() permanentLine2?: string;
  @IsOptional() @IsString() permanentCity?: string;
  @IsOptional() @IsString() permanentState?: string;
  @IsOptional() @IsString() permanentCountry?: string;
  @IsOptional() @IsString() permanentPincode?: string;
}

export class EmploymentDto {
  @IsOptional() @IsIn(['Full Time', 'Part Time']) employmentType?: string;
  @IsOptional() @IsString() workLocation?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() band?: string;
  @IsOptional() @IsString() costCenter?: string;
  @IsOptional() @IsString() shiftCode?: string;
  @IsOptional() @IsInt() noticePeriodDays?: number;
  @IsOptional() @IsDateString() offerDate?: string;
  @IsOptional() @IsDateString() contractEndAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class BankDto {
  @IsOptional() @IsString() accountHolder?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() accountType?: string;
}

export class GovernmentDto {
  @IsOptional() @IsString() aadhaarNumber?: string;
  @IsOptional() @IsString() panNumber?: string;
  @IsOptional() @IsString() passportNumber?: string;
  @IsOptional() @IsString() uan?: string;
  @IsOptional() @IsString() pfNumber?: string;
  @IsOptional() @IsString() esicNumber?: string;
}

export class FamilyMemberDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name!: string;
  @IsString() relation!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsBoolean() isDependent?: boolean;
}

export class EmergencyContactDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() relation?: string;
  @IsString() phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EITF001' })
  @IsString()
  employeeCode!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: 'Please enter a valid 10-digit mobile number.' })
  mobile?: string;
  @IsOptional() @IsEmail() workEmail?: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsIn(['Male', 'Female', 'Transgender']) gender?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  @IsOptional() @IsDateString() joinedAt?: string;
  @IsOptional() @IsDateString() probationEndAt?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() reportingToId?: string;

  @IsOptional() @ValidateNested() @Type(() => PersonalDto) personal?: PersonalDto;
  @IsOptional() @ValidateNested() @Type(() => EmploymentDto) employment?: EmploymentDto;
  @IsOptional() @ValidateNested() @Type(() => BankDto) bank?: BankDto;
  @IsOptional() @ValidateNested() @Type(() => GovernmentDto) government?: GovernmentDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FamilyMemberDto)
  familyMembers?: FamilyMemberDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];

  /** Optionally create login account */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  createLogin?: boolean;

  @ApiPropertyOptional({ description: 'Username / login email for the employee account' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Initial password (required when createLogin is true)' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  password?: string;

  @ApiPropertyOptional({ description: 'Must match password when provided' })
  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Use password instead' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  temporaryPassword?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: 'Please enter a valid 10-digit mobile number.' })
  mobile?: string;
  @IsOptional() @IsEmail() workEmail?: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsIn(['Male', 'Female', 'Transgender']) gender?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsDateString() joinedAt?: string;
  @IsOptional() @IsDateString() probationEndAt?: string;
  @IsOptional() @IsDateString() confirmationAt?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() reportingToId?: string | null;

  @IsOptional() @ValidateNested() @Type(() => PersonalDto) personal?: PersonalDto;
  @IsOptional() @ValidateNested() @Type(() => EmploymentDto) employment?: EmploymentDto;
  @IsOptional() @ValidateNested() @Type(() => BankDto) bank?: BankDto;
  @IsOptional() @ValidateNested() @Type(() => GovernmentDto) government?: GovernmentDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FamilyMemberDto)
  familyMembers?: FamilyMemberDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];
}

/** Employee self-service — only whitelisted fields */
export class UpdateMyProfileDto {
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @ValidateNested() @Type(() => PersonalDto) personal?: PersonalDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];
}

export class UpdateEmployeeStatusDto {
  @IsEnum(EmploymentStatus)
  status!: EmploymentStatus;

  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsDateString() effectiveAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ChangeUsernameDto {
  @IsString()
  @MinLength(5)
  username!: string;
}

export class ResetCredentialsDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() @MinLength(5) password?: string;
  @IsOptional() @IsBoolean() generatePassword?: boolean;
}

export class EmployeeQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  @IsOptional() @IsString() isActive?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
}
