// src/timetable/schemas/conflicts.schema.ts
// NEW SCHEMA: Separate collection for conflict tracking

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConflictDocument = Conflict & Document;

@Schema({ timestamps: true })
export class Conflict {
  @Prop({ type: Types.ObjectId, ref: 'Generation', required: true })
  generationId: Types.ObjectId;

  @Prop({ required: true })
  type: string; // e.g., 'teacher_clash', 'insufficient_slots'

  @Prop({ 
    required: true,
    enum: ['warning', 'error']
  })
  severity: string;

  @Prop({ required: true })
  message: string; // Human-readable description

  @Prop({ type: [Types.ObjectId], ref: 'TimetableSlot' })
  affectedSlots?: Types.ObjectId[]; // Slot IDs involved in conflict

  @Prop({ default: false })
  resolved?: boolean; // Whether conflict has been resolved

  @Prop()
  resolvedAt?: Date; // When conflict was resolved

  @Prop()
  resolvedBy?: string; // User who resolved the conflict

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ConflictSchema = SchemaFactory.createForClass(Conflict);

// Indexes
ConflictSchema.index({ generationId: 1 });
ConflictSchema.index({ severity: 1 });
ConflictSchema.index({ resolved: 1 });
ConflictSchema.index({ type: 1 });
ConflictSchema.index({ createdAt: -1 });