// src/departments/schemas/department.schema.ts
// Academic department (e.g. CSE). Sections, teachers and rooms can belong to one.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DepartmentDocument = Department & Document;

@Schema({ timestamps: true })
export class Department {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string; // e.g. CSE

  @Prop({ required: true, trim: true })
  name: string; // e.g. Computer Science and Engineering
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
