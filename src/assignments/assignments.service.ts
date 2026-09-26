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
import { RoomsService } from '../rooms/rooms.service';
import { SectionDocument } from '../sections/schemas/section.schema';
import { SubjectDocument } from '../subjects/schemas/subject.schema';
import { TeacherDocument } from '../teachers/schemas/teacher.schema';
import { RoomDocument } from '../rooms/schemas/room.schema';

const REFS = ['sectionIds', 'subjectId', 'teacherId', 'roomId'];

type AssignmentRefs = {
  sectionIds: string[];
  subjectId: string;
  teacherId: string;
  roomId?: string | null;
  batch?: string | null;
};

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    private sectionsService: SectionsService,
    private subjectsService: SubjectsService,
    private teachersService: TeachersService,
    private roomsService: RoomsService,
  ) {}

  async create(createAssignmentDto: CreateAssignmentDto): Promise<Assignment> {
    await this.validateRefs(createAssignmentDto);

    try {
      const assignment = new this.assignmentModel(createAssignmentDto);
      return await assignment.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException(
          this.duplicateMessage(createAssignmentDto.batch),
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<Assignment[]> {
    return await this.assignmentModel
      .find()
      .populate(REFS)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Assignment> {
    const assignment = await this.assignmentModel
      .findById(id)
      .populate(REFS)
      .exec();

    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
    return assignment;
  }

  async update(id: string, updateAssignmentDto: UpdateAssignmentDto): Promise<Assignment> {
    const existing = await this.assignmentModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
    // Validate the assignment as it will be after the update
    await this.validateRefs({
      sectionIds:
        updateAssignmentDto.sectionIds ?? existing.sectionIds.map(String),
      subjectId: updateAssignmentDto.subjectId ?? String(existing.subjectId),
      teacherId: updateAssignmentDto.teacherId ?? String(existing.teacherId),
      roomId:
        updateAssignmentDto.roomId === undefined
          ? existing.roomId && String(existing.roomId)
          : updateAssignmentDto.roomId,
      batch:
        updateAssignmentDto.batch === undefined
          ? existing.batch
          : updateAssignmentDto.batch,
    });

    try {
      const assignment = await this.assignmentModel
        .findByIdAndUpdate(id, updateAssignmentDto, {
          new: true,
          runValidators: true,
        })
        .populate(REFS)
        .exec();

      if (!assignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }

      return assignment;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException(
          this.duplicateMessage(updateAssignmentDto.batch ?? existing.batch),
        );
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

  // Refs come back as their full documents. A ref whose document was deleted comes back
  // as null (inside sectionIds too, thanks to retainNullValues).
  async findByIds(ids: string[]) {
    return await this.assignmentModel
      .find({ _id: { $in: ids } })
      .populate<{
        sectionIds: (SectionDocument | null)[];
        subjectId: SubjectDocument | null;
        teacherId: TeacherDocument | null;
        roomId: RoomDocument | null;
      }>([
        { path: 'sectionIds', options: { retainNullValues: true } },
        'subjectId',
        'teacherId',
        'roomId',
      ])
      .exec();
  }

  private async validateRefs({
    sectionIds,
    subjectId,
    teacherId,
    roomId,
    batch,
  }: AssignmentRefs) {
    const sections = await this.sectionsService.findByIds(sectionIds);
    if (sections.length !== sectionIds.length) {
      throw new BadRequestException('Section does not exist');
    }
    if (!(await this.subjectsService.exists(subjectId))) {
      throw new BadRequestException('Subject does not exist');
    }
    if (!(await this.teachersService.exists(teacherId))) {
      throw new BadRequestException('Teacher does not exist');
    }
    if (roomId && !(await this.roomsService.exists(roomId))) {
      throw new BadRequestException('Room does not exist');
    }
    if (batch) {
      if (sections.length !== 1) {
        throw new BadRequestException(
          'A batch can only be set when the assignment has a single section',
        );
      }
      const code = batch.trim().toUpperCase();
      if (!sections[0].batches.includes(code)) {
        throw new BadRequestException(
          `Section ${sections[0].code} has no batch ${code}. Add it to the section first.`,
        );
      }
    }
  }

  private duplicateMessage(batch?: string | null) {
    return batch
      ? `Batch ${batch.toUpperCase()} of this section already has an assignment for this subject`
      : 'One of these sections already has an assignment for this subject';
  }
}
