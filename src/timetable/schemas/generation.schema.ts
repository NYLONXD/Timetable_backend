// src/timetable/schemas/generation.schema.ts
// UPDATED: Removed embedded slots/conflicts, added break configuration

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Config subdocument
@Schema({ _id: false })
export class Config {
  @Prop({ 
    required: true,
    type: [String],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  })
  days: string[];

  @Prop({ required: true, min: 1, max: 12 })
  periodsPerDay: number;

  @Prop({ required: true, min: 1, max: 5 })
  maxConsecutive: number; // CHANGED: was 'maxConsecutiveClasses'

  @Prop({ type: [Number] })
  breakPeriods?: number[]; // NEW: Periods that are breaks [4, 7]

  @Prop({ min: 1 })
  lunchPeriod?: number; // NEW: Which period is lunch
}

export const ConfigSchema = SchemaFactory.createForClass(Config);

// Main Generation document
export type GenerationDocument = Generation & Document;

@Schema({ timestamps: true })
export class Generation {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: ConfigSchema, required: true })
  config: Config;

  @Prop({ 
    required: true,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  })
  status: string;

  @Prop()
  createdBy?: string;

  @Prop()
  generationTime?: number; // Time taken to generate (seconds)

  // REMOVED: timetable array (now in separate timetable_slots collection)
  // REMOVED: conflicts array (now in separate conflicts collection)

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  updatedAt?: Date;
}

export const GenerationSchema = SchemaFactory.createForClass(Generation);

// Indexes
GenerationSchema.index({ name: 1 });
GenerationSchema.index({ status: 1 });
GenerationSchema.index({ createdAt: -1 });