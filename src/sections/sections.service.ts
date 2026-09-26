// src/sections/sections.service.ts
// Purpose: Business logic for sections CRUD operations

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Section, SectionDocument } from './schemas/section.schema';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Department } from '../departments/schemas/department.schema';
import { Assignment } from '../assignments/schemas/assignment.schema';

// Batch codes are compared case-insensitively, so store them trimmed, upper-case and unique
const normalizeBatches = (batches: string[]) => [
  ...new Set(batches.map((b) => b.trim().toUpperCase()).filter(Boolean)),
];

@Injectable()
export class SectionsService {
  constructor(
    @InjectModel(Section.name) private sectionModel: Model<SectionDocument>,
    @InjectModel(Department.name) private departmentModel: Model<Department>,
    @InjectModel(Assignment.name) private assignmentModel: Model<Assignment>,
  ) {}

  // Create a new section
  async create(createSectionDto: CreateSectionDto): Promise<Section> {
    await this.checkDepartment(createSectionDto.departmentId);
    try {
      const section = new this.sectionModel({
        ...createSectionDto,
        batches: normalizeBatches(createSectionDto.batches ?? []),
      });
      return await section.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Section with this name already exists');
      }
      throw error;
    }
  }

  // Get all sections
  async findAll(): Promise<Section[]> {
    return await this.sectionModel
      .find()
      .populate('departmentId')
      .sort({ createdAt: -1 })
      .exec();
  }

  // Get one section by ID
  async findOne(id: string): Promise<Section> {
    const section = await this.sectionModel
      .findById(id)
      .populate('departmentId')
      .exec();
    if (!section) {
      throw new NotFoundException(`Section with ID ${id} not found`);
    }
    return section;
  }

  // Update a section
  async update(id: string, updateSectionDto: UpdateSectionDto): Promise<Section> {
    await this.checkDepartment(updateSectionDto.departmentId);
    const update = { ...updateSectionDto };
    if (updateSectionDto.batches) {
      update.batches = normalizeBatches(updateSectionDto.batches);
      const inUse = await this.assignmentModel.distinct('batch', {
        sectionIds: id,
        batch: { $nin: [...update.batches, null] },
      });
      if (inUse.length > 0) {
        throw new ConflictException(
          `Batch ${inUse.join(', ')} is still used by this section's assignments. Change those assignments first.`,
        );
      }
    }

    try {
      const section = await this.sectionModel
        .findByIdAndUpdate(id, update, { new: true })
        .populate('departmentId')
        .exec();

      if (!section) {
        throw new NotFoundException(`Section with ID ${id} not found`);
      }

      return section;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Section with this name already exists');
      }
      throw error;
    }
  }

  // Delete a section
  async remove(id: string): Promise<void> {
    const result = await this.sectionModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Section with ID ${id} not found`);
    }
  }

  // Check if section exists
  async exists(id: string): Promise<boolean> {
    const count = await this.sectionModel.countDocuments({ _id: id }).exec();
    return count > 0;
  }

  async findByIds(ids: string[]): Promise<SectionDocument[]> {
    return await this.sectionModel.find({ _id: { $in: ids } }).exec();
  }

  private async checkDepartment(departmentId?: string | null) {
    if (
      departmentId &&
      (await this.departmentModel.countDocuments({ _id: departmentId })) === 0
    ) {
      throw new BadRequestException('Department does not exist');
    }
  }
}
