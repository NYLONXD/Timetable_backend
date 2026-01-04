// src/assignments/schemas/assignment.schema.ts
// UPDATED: Changed to 'sessions' object, added 'constraint' and 'priority'

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Sessions subdocument
@Schema({ _id: false })
export class Sessions {
  @Prop({ required: true, min: 1, max: 10 })
  perWeek: number; // CHANGED: was 'creditsPerWeek'

  @Prop({ required: true, min: 1, max: 4, default: 1 })
  length: number; // NEW: How many consecutive periods (1 for theory, 2-3 for labs)
}

export const SessionsSchema = SchemaFactory.createForClass(Sessions);

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true })
export class Assignment {
  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Subject', required: true })
  subjectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Teacher', required: true })
  teacherId: Types.ObjectId;

  @Prop({ type: SessionsSchema, required: true })
  sessions: Sessions; // CHANGED: Now an object with perWeek and length

  @Prop({ 
    required: true,
    enum: ['hard', 'soft'],
    default: 'hard'
  })
  constraint: string; // NEW: hard = must satisfy, soft = try to satisfy

  @Prop({ min: 1, max: 10, default: 5 })
  priority?: number; // NEW: Priority for scheduling (1=low, 10=high)

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);

// Compound unique index
AssignmentSchema.index(
  { sectionId: 1, subjectId: 1 },
  { unique: true }
);

// Other indexes
AssignmentSchema.index({ sectionId: 1 });
AssignmentSchema.index({ teacherId: 1 });
AssignmentSchema.index({ subjectId: 1 });
AssignmentSchema.index({ constraint: 1 });
AssignmentSchema.index({ createdAt: -1 });