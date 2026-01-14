// src/teacher-availability/teacher-availability.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TeacherAvailability, TeacherAvailabilityDocument } from './schemas/teacher-availability.schema';
import { CreateTeacherAvailabilityDto } from './dto/create-teacher-availability.dto';
import { UpdateTeacherAvailabilityDto } from './dto/update-teacher-availability.dto';

@Injectable()
export class TeacherAvailabilityService {
  constructor(
    @InjectModel(TeacherAvailability.name) private availabilityModel: Model<TeacherAvailabilityDocument>,
  ) {}

  async create(createDto: CreateTeacherAvailabilityDto): Promise<TeacherAvailability> {
    try {
      const availability = new this.availabilityModel(createDto);
      return await availability.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Availability for this teacher/day/period already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<TeacherAvailability[]> {
    return await this.availabilityModel.find().populate('teacherId').exec();
  }

  async findByTeacher(teacherId: string): Promise<TeacherAvailability[]> {
    return await this.availabilityModel.find({ teacherId }).populate('teacherId').exec();
  }

  async findOne(id: string): Promise<TeacherAvailability> {
    const availability = await this.availabilityModel.findById(id).populate('teacherId').exec();
    if (!availability) {
      throw new NotFoundException(`Availability with ID ${id} not found`);
    }
    return availability;
  }

  async update(id: string, updateDto: UpdateTeacherAvailabilityDto): Promise<TeacherAvailability> {
    const availability = await this.availabilityModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .populate('teacherId')
      .exec();
    
    if (!availability) {
      throw new NotFoundException(`Availability with ID ${id} not found`);
    }
    
    return availability;
  }

  async remove(id: string): Promise<void> {
    const result = await this.availabilityModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Availability with ID ${id} not found`);
    }
  }

  async getAllAvailability(): Promise<TeacherAvailability[]> {
    return await this.availabilityModel.find().exec();
  }
}