// src/subjects/schemas/subject.schema.ts
// UPDATED: Changed 'type' to 'category', added new fields

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubjectDocument = Subject & Document;

@Schema({ timestamps: true })
export class Subject {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ 
    required: true,
    enum: ['theory', 'lab', 'seminar', 'tutorial'],
    default: 'theory'
  })
  category: string; // CHANGED: was 'type', now 'category'

  @Prop({ min: 1 })
  defaultCredits?: number; // NEW: Default classes per week

  @Prop({ default: false })
  requiresConsecutive?: boolean; // NEW: True for labs

  @Prop({ min: 1, default: 1 })
  defaultSessionLength?: number; // NEW: 1 for theory, 2-3 for labs

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);

// Indexes
SubjectSchema.index({ code: 1 }, { unique: true });
SubjectSchema.index({ name: 1 });
SubjectSchema.index({ category: 1 });
SubjectSchema.index({ createdAt: -1 });