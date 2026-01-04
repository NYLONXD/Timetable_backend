// src/timetable/schemas/timetable-slots.schema.ts
// NEW SCHEMA: Separate collection for timetable slots (scalability)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TimetableSlotDocument = TimetableSlot & Document;

@Schema({ timestamps: true })
export class TimetableSlot {
  @Prop({ type: Types.ObjectId, ref: 'Generation', required: true })
  generationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Subject' })
  subjectId?: Types.ObjectId; // Null for breaks

  @Prop({ type: Types.ObjectId, ref: 'Teacher' })
  teacherId?: Types.ObjectId; // Null for breaks

  @Prop({ required: true })
  day: string;

  @Prop({ required: true, min: 1 })
  period: number;

  @Prop({ 
    required: true,
    enum: ['active', 'locked', 'substituted', 'cancelled', 'break'],
    default: 'active'
  })
  status: string;

  @Prop({ default: false })
  isLocked?: boolean; // Prevent automatic changes

  @Prop()
  lockReason?: string; // Why this slot is locked

  @Prop({ type: Types.ObjectId, ref: 'Teacher' })
  originalTeacherId?: Types.ObjectId; // Original teacher if substituted

  @Prop()
  substituteReason?: string; // Reason for substitution

  @Prop()
  changedBy?: string; // User who made the change

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  updatedAt?: Date;
}

export const TimetableSlotSchema = SchemaFactory.createForClass(TimetableSlot);

// Compound unique index - no two classes at same time for same section
TimetableSlotSchema.index(
  { generationId: 1, sectionId: 1, day: 1, period: 1 },
  { unique: true }
);

// Query indexes
TimetableSlotSchema.index({ generationId: 1, teacherId: 1 });
TimetableSlotSchema.index({ generationId: 1, sectionId: 1 });
TimetableSlotSchema.index({ teacherId: 1, day: 1, period: 1 });
TimetableSlotSchema.index({ status: 1 });
TimetableSlotSchema.index({ isLocked: 1 });