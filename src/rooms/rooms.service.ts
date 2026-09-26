// src/rooms/rooms.service.ts
// Purpose: Business logic for rooms CRUD operations

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isDuplicateKey } from '../database/mongo-errors';
import { Model } from 'mongoose';
import { Room, RoomDocument } from './schemas/room.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Assignment } from '../assignments/schemas/assignment.schema';
import { Department } from '../departments/schemas/department.schema';

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<Assignment>,
    @InjectModel(Department.name) private departmentModel: Model<Department>,
  ) {}

  async create(createDto: CreateRoomDto): Promise<Room> {
    await this.checkDepartment(createDto.departmentId);
    try {
      return await new this.roomModel(createDto).save();
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException('A room with this code already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<Room[]> {
    return await this.roomModel
      .find()
      .populate('departmentId')
      .sort({ code: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Room> {
    const room = await this.roomModel
      .findById(id)
      .populate('departmentId')
      .exec();
    if (!room) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }
    return room;
  }

  async update(id: string, updateDto: UpdateRoomDto): Promise<Room> {
    await this.checkDepartment(updateDto.departmentId);
    try {
      const room = await this.roomModel
        .findByIdAndUpdate(id, updateDto, { new: true, runValidators: true })
        .populate('departmentId')
        .exec();
      if (!room) {
        throw new NotFoundException(`Room with ID ${id} not found`);
      }
      return room;
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException('A room with this code already exists');
      }
      throw error;
    }
  }

  // Refuses while assignments are pinned to the room
  async remove(id: string): Promise<void> {
    const pinned = await this.assignmentModel
      .countDocuments({ roomId: id })
      .exec();
    if (pinned > 0) {
      throw new ConflictException(
        `${pinned} assignment(s) are pinned to this room. Unpin them first.`,
      );
    }

    const result = await this.roomModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }
  }

  async exists(id: string): Promise<boolean> {
    return (await this.roomModel.countDocuments({ _id: id }).exec()) > 0;
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
