// src/subjects/subjects.service.ts
// Purpose: Business logic for subjects CRUD operations

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subject, SubjectDocument } from './schemas/subject.schema';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectModel(Subject.name) private subjectModel: Model<SubjectDocument>,
  ) {}

  async create(createSubjectDto: CreateSubjectDto): Promise<Subject> {
    try {
      const subject = new this.subjectModel(createSubjectDto);
      return await subject.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Subject with this code already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<Subject[]> {
    return await this.subjectModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Subject> {
    const subject = await this.subjectModel.findById(id).exec();
    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }
    return subject;
  }

  async update(id: string, updateSubjectDto: UpdateSubjectDto): Promise<Subject> {
    try {
      const subject = await this.subjectModel
        .findByIdAndUpdate(id, updateSubjectDto, { new: true })
        .exec();
      
      if (!subject) {
        throw new NotFoundException(`Subject with ID ${id} not found`);
      }
      
      return subject;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Subject with this code already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.subjectModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.subjectModel.countDocuments({ _id: id }).exec();
    return count > 0;
  }
}
