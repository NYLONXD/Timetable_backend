// src/timetable/timetable.module.ts
// UPDATED: Added TimetableSlot, Conflict schemas and TeacherAvailabilityModule

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimetableController } from '../timetable/timetable.controller';
import { TimetableService } from '../timetable/timetable.service';
import { Generation, GenerationSchema } from '../timetable/schemas/generation.schema';
import { TimetableSlot, TimetableSlotSchema } from '../timetable/schemas/timetable-slots.schema';
import { Conflict, ConflictSchema } from '../timetable/schemas/conflicts.schema';
import { AssignmentsModule } from '../assignments/assignments.module';
import { TeacherAvailabilityModule } from '../teacher-availability/teacher-availability.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Generation.name, schema: GenerationSchema },
      { name: TimetableSlot.name, schema: TimetableSlotSchema }, // NEW
      { name: Conflict.name, schema: ConflictSchema }, // NEW
    ]),
    AssignmentsModule,
    TeacherAvailabilityModule, // NEW
  ],
  controllers: [TimetableController],
  providers: [TimetableService],
  exports: [TimetableService],
})
export class TimetableModule {}