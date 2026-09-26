// src/timetable/schemas/timetable-slots.schema.ts
// One period of one class in a generated timetable

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TimetableSlotDocument = TimetableSlot & Document;

@Schema({ timestamps: true })
export class TimetableSlot {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Generation',
    required: true,
  })
  generationId: Types.ObjectId;

  // Sections attending: one, or several for a combined class
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Section' }],
    validate: {
      validator: (ids: Types.ObjectId[]) => ids.length > 0,
      message: 'A slot needs at least one section',
    },
  })
  sectionIds: Types.ObjectId[];

  @Prop({ trim: true })
  batch?: string; // only this batch of the section attends

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Subject' })
  subjectId?: Types.ObjectId; // Null for breaks

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Teacher' })
  teacherId?: Types.ObjectId; // Null for breaks

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room' })
  roomId?: Types.ObjectId; // unset when the institution has no rooms set up

  @Prop()
  parallelGroup?: string; // runs alongside the other classes with this label

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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Teacher' })
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

// Within a timetable, a teacher or a room has at most one class per period. (Sections can
// legitimately have several at once: parallel batches, electives.)
TimetableSlotSchema.index(
  { generationId: 1, teacherId: 1, day: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: { teacherId: { $type: 'objectId' } },
  },
);
TimetableSlotSchema.index(
  { generationId: 1, roomId: 1, day: 1, period: 1 },
  { unique: true, partialFilterExpression: { roomId: { $type: 'objectId' } } },
);

// Query indexes
TimetableSlotSchema.index({ generationId: 1, sectionIds: 1 });
TimetableSlotSchema.index({ teacherId: 1, day: 1, period: 1 });
TimetableSlotSchema.index({ status: 1 });
TimetableSlotSchema.index({ isLocked: 1 });
