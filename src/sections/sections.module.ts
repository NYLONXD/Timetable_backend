// src/sections/sections.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';
import { Section, SectionSchema } from './schemas/section.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import {
  Assignment,
  AssignmentSchema,
} from '../assignments/schemas/assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Section.name, schema: SectionSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Assignment.name, schema: AssignmentSchema },
    ]),
  ],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService], // Export for use in other modules
})
export class SectionsModule {}