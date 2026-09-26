// src/timetable/dto/update-generation.dto.ts
import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateGenerationDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Making a timetable active goes through POST /timetable/:id/activate, which checks it
  // against the term's other active timetables
  @IsOptional()
  @IsIn(['draft', 'archived'])
  status?: string;
}