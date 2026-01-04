// src/timetable/dto/update-generation.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class UpdateGenerationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;
}