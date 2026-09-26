// src/departments/departments.service.ts
// Purpose: Business logic for departments CRUD operations

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isDuplicateKey } from '../database/mongo-errors';
import { Model } from 'mongoose';
import { Department, DepartmentDocument } from './schemas/department.schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Section } from '../sections/schemas/section.schema';
import { Teacher } from '../teachers/schemas/teacher.schema';
import { Room } from '../rooms/schemas/room.schema';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private departmentModel: Model<DepartmentDocument>,
    @InjectModel(Section.name) private sectionModel: Model<Section>,
    @InjectModel(Teacher.name) private teacherModel: Model<Teacher>,
    @InjectModel(Room.name) private roomModel: Model<Room>,
  ) {}

  async create(createDto: CreateDepartmentDto): Promise<Department> {
    try {
      return await new this.departmentModel(createDto).save();
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException(
          'A department with this code already exists',
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<Department[]> {
    return await this.departmentModel.find().sort({ code: 1 }).exec();
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.departmentModel.findById(id).exec();
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return department;
  }

  async update(
    id: string,
    updateDto: UpdateDepartmentDto,
  ): Promise<Department> {
    try {
      const department = await this.departmentModel
        .findByIdAndUpdate(id, updateDto, { new: true, runValidators: true })
        .exec();
      if (!department) {
        throw new NotFoundException(`Department with ID ${id} not found`);
      }
      return department;
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException(
          'A department with this code already exists',
        );
      }
      throw error;
    }
  }

  // Refuses while sections, teachers or rooms still belong to the department
  async remove(id: string): Promise<void> {
    const [sections, teachers, rooms] = await Promise.all([
      this.sectionModel.countDocuments({ departmentId: id }).exec(),
      this.teacherModel.countDocuments({ departmentId: id }).exec(),
      this.roomModel.countDocuments({ departmentId: id }).exec(),
    ]);
    if (sections + teachers + rooms > 0) {
      throw new ConflictException(
        `This department still has ${sections} section(s), ${teachers} teacher(s) and ${rooms} room(s). Move them to another department first.`,
      );
    }

    const result = await this.departmentModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
  }

  async exists(id: string): Promise<boolean> {
    return (await this.departmentModel.countDocuments({ _id: id }).exec()) > 0;
  }
}
