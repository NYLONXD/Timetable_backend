import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TeacherAvailability, TeacherAvailabilityDocument } from './schemas/teacher-availability.schema';

@Injectable()
export class TeacherAvailabilityService {
  constructor(
    @InjectModel(TeacherAvailability.name) private availabilityModel: Model<TeacherAvailabilityDocument>,
  ) {}

  async getAllAvailability(): Promise<TeacherAvailability[]> {
    return await this.availabilityModel.find().exec();
  }
}
