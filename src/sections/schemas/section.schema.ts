// src/sections/schemas/section.schema.ts
// UPDATED: Changed 'name' to 'code', added 'name' and 'strength' fields

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SectionDocument = Section & Document;

@Schema({ timestamps: true })
export class Section {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string; // CHANGED: was 'name', now 'code' (e.g., CSE-A)

  @Prop({ trim: true })
  name?: string; // NEW: Full name (e.g., "Computer Science A")

  @Prop({ required: true, min: 1, max: 12 })
  semester: number; // CHANGED: now required

  @Prop({ required: true, trim: true })
  branch: string; // CHANGED: now required

  @Prop({ min: 1 })
  strength?: number; // NEW: Number of students

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SectionSchema = SchemaFactory.createForClass(Section);

// Indexes
SectionSchema.index({ code: 1 }, { unique: true });
SectionSchema.index({ branch: 1 });
SectionSchema.index({ semester: 1 });
SectionSchema.index({ createdAt: -1 });