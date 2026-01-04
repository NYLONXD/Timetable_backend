// src/teacher-availability/dto/update-teacher-availability.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateTeacherAvailabilityDto } from './create-teacher-availability.dto';

export class UpdateTeacherAvailabilityDto extends PartialType(CreateTeacherAvailabilityDto) {}