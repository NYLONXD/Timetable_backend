// src/teachers/schemas/teacher.schema.ts
// UPDATED: Added 'staffId' as unique identifier, added 'maxHoursPerWeek'

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TeacherDocument = Teacher & Document;

@Schema({ timestamps: true })
export class Teacher {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  staffId: string; // NEW: Unique employee ID (e.g., EMP-1023)

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ 
    trim: true, 
    lowercase: true,
    match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    sparse: true,
    unique: true
  })
  email?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ min: 1, max: 10, default: 6 })
  maxHoursPerDay?: number;

  @Prop({ min: 1, max: 40, default: 30 })
  maxHoursPerWeek?: number; // NEW: Weekly limit

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const TeacherSchema = SchemaFactory.createForClass(Teacher);

// Indexes
TeacherSchema.index({ staffId: 1 }, { unique: true });
TeacherSchema.index({ name: 1 });
TeacherSchema.index({ email: 1 }, { unique: true, sparse: true });
TeacherSchema.index({ department: 1 });
TeacherSchema.index({ createdAt: -1 });