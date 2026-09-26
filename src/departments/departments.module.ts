// src/departments/departments.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { Department, DepartmentSchema } from './schemas/department.schema';
import { Section, SectionSchema } from '../sections/schemas/section.schema';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema';
import { Room, RoomSchema } from '../rooms/schemas/room.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      // Read-only here: used to refuse deleting a department that is still in use
      { name: Section.name, schema: SectionSchema },
      { name: Teacher.name, schema: TeacherSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
