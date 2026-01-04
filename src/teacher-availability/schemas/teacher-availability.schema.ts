// src/teacher-availability/schemas/teacher-availability.schema.ts
// NEW SCHEMA: Track when teachers are unavailable or prefer certain slots

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeacherAvailabilityDocument = TeacherAvailability & Document;

@Schema({ timestamps: true })
export class TeacherAvailability {
  @Prop({ type: Types.ObjectId, ref: 'Teacher', required: true })
  teacherId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  })
  day: string;

  @Prop({ required: true, min: 1 })
  period: number;

  @Prop({ 
    required: true,
    enum: ['unavailable', 'preferred']
  })
  type: string; // unavailable = hard constraint, preferred = soft constraint

  @Prop()
  reason?: string; // Optional reason (e.g., "Department meeting")

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const TeacherAvailabilitySchema = SchemaFactory.createForClass(TeacherAvailability);

// Compound unique index - one entry per teacher/day/period
TeacherAvailabilitySchema.index(
  { teacherId: 1, day: 1, period: 1 },
  { unique: true }
);

TeacherAvailabilitySchema.index({ teacherId: 1 });
TeacherAvailabilitySchema.index({ type: 1 });