// src/terms/schemas/term.schema.ts
// An academic term (e.g. "2026-27 Odd Semester") and its bell schedule. Every timetable belongs
// to a term, so all departments' timetables in a term share the same days and periods. That is
// what lets the generator avoid double-booking teachers and rooms across departments.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/; // 24h HH:mm

// Clock time of one period, e.g. { start: '09:00', end: '09:50' }
@Schema({ _id: false })
export class PeriodTime {
  @Prop({ required: true, match: TIME_OF_DAY })
  start: string;

  @Prop({ required: true, match: TIME_OF_DAY })
  end: string;
}

export const PeriodTimeSchema = SchemaFactory.createForClass(PeriodTime);

export type TermDocument = Term & Document;

@Schema({ timestamps: true })
export class Term {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ type: [String], enum: WEEK_DAYS, required: true })
  days: string[];

  @Prop({ required: true, min: 1, max: 12 })
  periodsPerDay: number;

  @Prop({ type: [PeriodTimeSchema], default: [] })
  periodTimes: PeriodTime[]; // empty, or one entry per period (breaks included)

  @Prop({ type: [Number], default: [] })
  breakPeriods: number[]; // 1-based periods with no classes

  @Prop({ min: 1 })
  lunchPeriod?: number;
}

export const TermSchema = SchemaFactory.createForClass(Term);
