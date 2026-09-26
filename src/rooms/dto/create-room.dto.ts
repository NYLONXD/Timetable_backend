// src/rooms/dto/create-room.dto.ts
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ROOM_TYPES, type RoomType } from '../schemas/room.schema';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  building?: string;

  @IsIn(ROOM_TYPES)
  type: RoomType;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsMongoId()
  departmentId?: string;
}
