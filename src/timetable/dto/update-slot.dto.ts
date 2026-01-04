// src/timetable/dto/update-slot.dto.ts
// UPDATED: New fields for slot management

import { IsString, IsOptional, IsInt, Min, IsEnum, IsMongoId, IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateSlotDto {
  @IsMongoId()
  @IsNotEmpty()
  slotId: string; // Now references TimetableSlot _id

  @IsOptional()
  @IsEnum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
  day?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  period?: number;

  @IsOptional()
  @IsMongoId()
  teacherId?: string;

  @IsOptional()
  @IsEnum(['active', 'locked', 'substituted', 'cancelled', 'break'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsString()
  lockReason?: string; // NEW: Why this slot is locked

  @IsOptional()
  @IsString()
  substituteReason?: string; // NEW: Reason for substitution

  @IsOptional()
  @IsString()
  changedBy?: string;
}

