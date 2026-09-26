// src/timetable/schemas/generation.schema.ts
// A generated timetable ("generation") for some sections in one term

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { PeriodTime, PeriodTimeSchema } from '../../terms/schemas/term.schema';

// Config subdocument: the term's bell schedule as it was when the timetable was generated,
// plus the generator's settings
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

  @Prop({ type: [PeriodTimeSchema], default: [] })
  periodTimes: PeriodTime[]; // clock time of each period, if the term has them
}

export const ConfigSchema = SchemaFactory.createForClass(Config);

// Main Generation document
export type GenerationDocument = Generation & Document;

@Schema({ timestamps: true })
export class Generation {
  @Prop({ required: true, trim: true })
  name: string;

  // Missing only on timetables generated before terms existed
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Term' })
  termId?: Types.ObjectId;

  // Sections this timetable schedules. Activating it replaces the term's active timetables
  // for any of these sections; the term's other active timetables are left in place.
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Section' }],
    default: [],
  })
  sectionIds: Types.ObjectId[];

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

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  updatedAt?: Date;
}

export const GenerationSchema = SchemaFactory.createForClass(Generation);

// Indexes
GenerationSchema.index({ name: 1 });
GenerationSchema.index({ termId: 1, status: 1 });
GenerationSchema.index({ status: 1 });
GenerationSchema.index({ createdAt: -1 });
