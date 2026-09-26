// src/rooms/schemas/room.schema.ts
// A bookable room. Lab subjects are scheduled only in 'lab' rooms, other subjects only in non-lab rooms.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export const ROOM_TYPES = ['lecture', 'lab', 'seminar'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export type RoomDocument = Room & Document;

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string; // e.g. LH-101, CS-LAB-2

  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  building?: string;

  @Prop({ type: String, required: true, enum: ROOM_TYPES, default: 'lecture' })
  type: RoomType;

  @Prop({ required: true, min: 1 })
  capacity: number; // seats

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department' })
  departmentId?: Types.ObjectId; // owning department, informational
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ type: 1, capacity: 1 });
