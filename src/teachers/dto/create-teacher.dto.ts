// src/teachers/dto/create-teacher.dto.ts
// UPDATED: Added 'staffId' field, added 'maxHoursPerWeek'

import {
  IsEmail,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty()
  staffId: string; // NEW: Unique employee ID (e.g., EMP-1023)

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxHoursPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40)
  maxHoursPerWeek?: number; // NEW: Weekly limit
}

