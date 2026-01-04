// src/teachers/teachers.service.ts
// Purpose: Business logic for teachers CRUD operations

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Teacher, TeacherDocument } from './schemas/teacher.schema';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    @InjectModel(Teacher.name) private teacherModel: Model<TeacherDocument>,
  ) {}

  async create(createTeacherDto: CreateTeacherDto): Promise<Teacher> {
    try {
      const teacher = new this.teacherModel(createTeacherDto);
      return await teacher.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Teacher with this email already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<Teacher[]> {
    return await this.teacherModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Teacher> {
    const teacher = await this.teacherModel.findById(id).exec();
    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }
    return teacher;
  }

  async update(id: string, updateTeacherDto: UpdateTeacherDto): Promise<Teacher> {
    try {
      const teacher = await this.teacherModel
        .findByIdAndUpdate(id, updateTeacherDto, { new: true })
        .exec();
      
      if (!teacher) {
        throw new NotFoundException(`Teacher with ID ${id} not found`);
      }
      
      return teacher;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Teacher with this email already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.teacherModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Teacher with ID ${id} not found`);
    }
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.teacherModel.countDocuments({ _id: id }).exec();
    return count > 0;
  }
}