// src/timetable/dto/generate-timetable.dto.ts
// Days, periods and breaks come from the term's bell schedule

import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateTimetableDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsMongoId()
  termId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  maxConsecutive: number; // most classes a section has back to back

  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  assignmentIds: string[];
}
