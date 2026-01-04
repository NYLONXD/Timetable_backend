// src/teacher-availability/dto/create-teacher-availability.dto.ts
// NEW DTO: For creating teacher availability records

import { IsString, IsOptional, IsInt, Min, IsNotEmpty, IsMongoId, IsEnum } from 'class-validator';

export class CreateTeacherAvailabilityDto {
  @IsMongoId()
  @IsNotEmpty()
  teacherId: string;

  @IsEnum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
  day: string;

  @IsInt()
  @Min(1)
  period: number;

  @IsEnum(['unavailable', 'preferred'])
  type: string; // unavailable = hard constraint, preferred = soft constraint

  @IsOptional()
  @IsString()
  reason?: string; // Optional reason
}

