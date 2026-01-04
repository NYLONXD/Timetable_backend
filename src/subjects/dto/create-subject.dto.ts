// src/subjects/dto/create-subject.dto.ts
// UPDATED: Changed to 'category', added new fields

import { IsString, IsOptional, IsEnum, IsNotEmpty, IsInt, Min, IsBoolean } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['theory', 'lab', 'seminar', 'tutorial'])
  category: string; // CHANGED: was 'type', now 'category'

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCredits?: number; // NEW: Default classes per week

  @IsOptional()
  @IsBoolean()
  requiresConsecutive?: boolean; // NEW: True for labs

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultSessionLength?: number; // NEW: 1 for theory, 2-3 for labs
}

