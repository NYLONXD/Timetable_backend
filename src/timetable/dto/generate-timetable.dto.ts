// src/timetable/dto/generate-timetable.dto.ts
// UPDATED: Updated config structure

import { 
  IsString, 
  IsArray, 
  IsInt, 
  Min, 
  Max, 
  IsNotEmpty, 
  IsMongoId, 
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional
} from 'class-validator';
import { Type } from 'class-transformer';

class ConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsEnum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], { each: true })
  days: string[];

  @IsInt()
  @Min(1)
  @Max(12)
  periodsPerDay: number;

  @IsInt()
  @Min(1)
  @Max(5)
  maxConsecutive: number; // CHANGED: was 'maxConsecutiveClasses'

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  breakPeriods?: number[]; // NEW: Periods that are breaks

  @IsOptional()
  @IsInt()
  @Min(1)
  lunchPeriod?: number; // NEW: Which period is lunch
}

export class GenerateTimetableDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateNested()
  @Type(() => ConfigDto)
  config: ConfigDto;

  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  assignmentIds: string[];
}

