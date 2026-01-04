// src/app.module.ts
// UPDATED: Added TeacherAvailabilityModule

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { SectionsModule } from './sections/sections.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TeachersModule } from './teachers/teachers.module';
import { TeacherAvailabilityModule } from './teacher-availability/teacher-availability.module'; // NEW
import { AssignmentsModule } from './assignments/assignments.module';
import { TimetableModule } from './timetable/timetable.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    SectionsModule,
    SubjectsModule,
    TeachersModule,
    TeacherAvailabilityModule, // NEW
    AssignmentsModule,
    TimetableModule,
  ],
})
export class AppModule {}