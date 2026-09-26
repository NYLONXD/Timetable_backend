// src/terms/dto/create-term.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TIME_OF_DAY, WEEK_DAYS } from '../schemas/term.schema';

export class PeriodTimeDto {
  @Matches(TIME_OF_DAY, { message: 'start must be a 24h time like 09:00' })
  start: string;

  @Matches(TIME_OF_DAY, { message: 'end must be a 24h time like 09:50' })
  end: string;
}

export class CreateTermDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(WEEK_DAYS, { each: true })
  days: string[];

  @IsInt()
  @Min(1)
  @Max(12)
  periodsPerDay: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PeriodTimeDto)
  periodTimes?: PeriodTimeDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  breakPeriods?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  lunchPeriod?: number;
}
