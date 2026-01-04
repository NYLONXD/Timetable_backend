// src/assignments/assignments.service.ts
// Purpose: Business logic for assignments CRUD operations

import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { SectionsService } from '../sections/sections.service';
import { SubjectsService } from '../subjects/subjects.service';
import { TeachersService } from '../teachers/teachers.service';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    private sectionsService: SectionsService,
    private subjectsService: SubjectsService,
    private teachersService: TeachersService,
  ) {}

  async create(createAssignmentDto: CreateAssignmentDto): Promise<Assignment> {
    // Validate that section, subject, and teacher exist
    const sectionExists = await this.sectionsService.exists(createAssignmentDto.sectionId);
    const subjectExists = await this.subjectsService.exists(createAssignmentDto.subjectId);
    const teacherExists = await this.teachersService.exists(createAssignmentDto.teacherId);

    if (!sectionExists) {
      throw new BadRequestException('Section does not exist');
    }
    if (!subjectExists) {
      throw new BadRequestException('Subject does not exist');
    }
    if (!teacherExists) {
      throw new BadRequestException('Teacher does not exist');
    }

    try {
      const assignment = new this.assignmentModel(createAssignmentDto);
      return await assignment.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This assignment combination already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<Assignment[]> {
    return await this.assignmentModel
      .find()
      .populate('sectionId')
      .populate('subjectId')
      .populate('teacherId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Assignment> {
    const assignment = await this.assignmentModel
      .findById(id)
      .populate('sectionId')
      .populate('subjectId')
      .populate('teacherId')
      .exec();
    
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
    return assignment;
  }

  async update(id: string, updateAssignmentDto: UpdateAssignmentDto): Promise<Assignment> {
    try {
      const assignment = await this.assignmentModel
        .findByIdAndUpdate(id, updateAssignmentDto, { new: true })
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId')
        .exec();
      
      if (!assignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }
      
      return assignment;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This assignment combination already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.assignmentModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
  }

  async findByIds(ids: string[]): Promise<Assignment[]> {
    return await this.assignmentModel
      .find({ _id: { $in: ids } })
      .populate('sectionId')
      .populate('subjectId')
      .populate('teacherId')
      .exec();
  }
}