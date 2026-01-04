// src/assignments/dto/create-assignment.dto.ts
// UPDATED: Changed to 'sessions' object, added 'constraint' and 'priority'

import { IsString, IsInt, Min, Max, IsOptional, IsNotEmpty, IsMongoId, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Sessions DTO
class SessionsDto {
  @IsInt()
  @Min(1)
  @Max(10)
  perWeek: number; // CHANGED: was 'creditsPerWeek'

  @IsInt()
  @Min(1)
  @Max(4)
  length: number; // NEW: 1 for theory, 2-3 for labs
}

export class CreateAssignmentDto {
  @IsMongoId()
  @IsNotEmpty()
  sectionId: string;

  @IsMongoId()
  @IsNotEmpty()
  subjectId: string;

  @IsMongoId()
  @IsNotEmpty()
  teacherId: string;

  @ValidateNested()
  @Type(() => SessionsDto)
  sessions: SessionsDto; // CHANGED: Now an object

  @IsEnum(['hard', 'soft'])
  constraint: string; // NEW: hard = must satisfy, soft = try to satisfy

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number; // NEW: Priority for scheduling (1=low, 10=high)
}
