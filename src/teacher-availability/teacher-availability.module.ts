// src/teacher-availability/teacher-availability.module.ts
// NEW MODULE: Teacher availability module

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeacherAvailabilityController } from './teacher-availability.controller';
import { TeacherAvailabilityService } from './teacher-availability.service';
import { TeacherAvailability, TeacherAvailabilitySchema } from './schemas/teacher-availability.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeacherAvailability.name, schema: TeacherAvailabilitySchema }
    ]),
  ],
  controllers: [TeacherAvailabilityController],
  providers: [TeacherAvailabilityService],
  exports: [TeacherAvailabilityService],
})
export class TeacherAvailabilityModule {}