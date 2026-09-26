// src/sections/dto/create-section.dto.ts
// UPDATED: Changed to 'code' field, added 'name' and 'strength'

import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty()
  code: string; // CHANGED: was 'name', now 'code' (e.g., CSE-A)

  @IsOptional()
  @IsString()
  name?: string; // NEW: Full name (e.g., "Computer Science A")

  @IsInt()
  @Min(1)
  @Max(12)
  semester: number; // CHANGED: now required

  @IsString()
  @IsNotEmpty()
  branch: string; // CHANGED: now required

  @IsOptional()
  @IsInt()
  @Min(1)
  strength?: number; // NEW: Number of students

  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  batches?: string[]; // e.g. ['B1', 'B2'] when labs split the section
}

// src/sections/dto/update-section.dto.ts
