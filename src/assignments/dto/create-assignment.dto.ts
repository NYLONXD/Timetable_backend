// src/assignments/dto/create-assignment.dto.ts
// UPDATED: Changed to 'sessions' object, added 'constraint' and 'priority'

import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
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
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsMongoId({ each: true })
  sectionIds: string[]; // several sections = a combined class

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

  // For the optional fields below, send null on update to clear them

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  batch?: string | null; // only this batch of the (single) section attends

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parallelGroup?: string | null; // same label = scheduled at the same times

  @IsOptional()
  @IsMongoId()
  roomId?: string | null; // always use this room

  @IsOptional()
  @IsInt()
  @Min(1)
  studentCount?: number | null; // expected attendance, if not the whole sections
}
