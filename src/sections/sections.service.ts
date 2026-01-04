// src/sections/sections.service.ts
// Purpose: Business logic for sections CRUD operations

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Section, SectionDocument } from './schemas/section.schema';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionsService {
  constructor(
    @InjectModel(Section.name) private sectionModel: Model<SectionDocument>,
  ) {}

  // Create a new section
  async create(createSectionDto: CreateSectionDto): Promise<Section> {
    try {
      const section = new this.sectionModel(createSectionDto);
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
    return await this.sectionModel.find().sort({ createdAt: -1 }).exec();
  }

  // Get one section by ID
  async findOne(id: string): Promise<Section> {
    const section = await this.sectionModel.findById(id).exec();
    if (!section) {
      throw new NotFoundException(`Section with ID ${id} not found`);
    }
    return section;
  }

  // Update a section
  async update(id: string, updateSectionDto: UpdateSectionDto): Promise<Section> {
    try {
      const section = await this.sectionModel
        .findByIdAndUpdate(id, updateSectionDto, { new: true })
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
}