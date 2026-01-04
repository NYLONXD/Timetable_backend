// src/timetable/timetable.service.ts
// UPDATED: Works with separate TimetableSlot and Conflict collections

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Generation, GenerationDocument } from './schemas/generation.schema';
import { TimetableSlot, TimetableSlotDocument } from './schemas/timetable-slots.schema';
import { Conflict, ConflictDocument } from './schemas/conflicts.schema';
import { GenerateTimetableDto } from './dto/generate-timetable.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { UpdateGenerationDto } from './dto/update-generation.dto';
import { AssignmentsService } from '../assignments/assignments.service';
import { TeacherAvailabilityService } from '../teacher-availability/teacher-availability.service';

@Injectable()
export class TimetableService {
  constructor(
    @InjectModel(Generation.name) private generationModel: Model<GenerationDocument>,
    @InjectModel(TimetableSlot.name) private slotModel: Model<TimetableSlotDocument>,
    @InjectModel(Conflict.name) private conflictModel: Model<ConflictDocument>,
    private assignmentsService: AssignmentsService,
    private teacherAvailabilityService: TeacherAvailabilityService,
  ) {}

  // ============================================
  // CORE GENERATION ALGORITHM
  // ============================================

  async generate(generateDto: GenerateTimetableDto): Promise<Generation> {
    const startTime = Date.now();
    
    // Fetch assignments with populated data
    const assignments = await this.assignmentsService.findByIds(generateDto.assignmentIds);
    
    if (assignments.length === 0) {
      throw new BadRequestException('No valid assignments provided');
    }

    // Create generation document first
    const generation = new this.generationModel({
      name: generateDto.name,
      config: generateDto.config,
      status: 'draft',
    });
    await generation.save();

    // Fetch teacher availability constraints
    const teacherAvailability = await this.teacherAvailabilityService.getAllAvailability();

    // Initialize availability matrices
    const teacherSlots = this.initializeAvailability(
      assignments.map(a => a.teacherId.toString()),
      generateDto.config.days,
      generateDto.config.periodsPerDay
    );

    const sectionSlots = this.initializeAvailability(
      assignments.map(a => a.sectionId.toString()),
      generateDto.config.days,
      generateDto.config.periodsPerDay
    );

    // Apply teacher availability constraints
    teacherAvailability.forEach(avail => {
      if (avail.type === 'unavailable') {
        const teacherId = avail.teacherId.toString();
        const dayIndex = generateDto.config.days.indexOf(avail.day);
        if (dayIndex !== -1 && teacherSlots[teacherId]) {
          teacherSlots[teacherId][avail.day][avail.period - 1] = false;
        }
      }
    });

    const slots: TimetableSlot[] = [];
    const conflicts: Conflict[] = [];

    // Sort assignments by constraint (hard first), then priority (high first), then sessions
    const sortedAssignments = [...assignments].sort((a, b) => {
      if (a.constraint === 'hard' && b.constraint !== 'hard') return -1;
      if (a.constraint !== 'hard' && b.constraint === 'hard') return 1;
      if (a.priority !== b.priority) return (b.priority || 5) - (a.priority || 5);
      return b.sessions.perWeek - a.sessions.perWeek;
    });

    // Place each assignment
    for (const assignment of sortedAssignments) {
      const sectionId = assignment.sectionId.toString();
      const subjectId = assignment.subjectId.toString();
      const teacherId = assignment.teacherId.toString();
      const { sessions } = assignment;

      // Find valid slots
      const validSlots = this.findValidSlots(
        sectionId,
        teacherId,
        generateDto.config.days,
        generateDto.config.periodsPerDay,
        generateDto.config.maxConsecutive,
        sessions.length,
        sectionSlots,
        teacherSlots,
        slots
      );

      // Shuffle for randomization
      const shuffledSlots = this.shuffleArray(validSlots);

      let placed = 0;
      for (const slot of shuffledSlots) {
        if (placed >= sessions.perWeek) break;

        // Place session (might span multiple consecutive periods)
        const canPlace = this.canPlaceSession(
          sectionId,
          teacherId,
          slot.day,
          slot.period,
          sessions.length,
          sectionSlots,
          teacherSlots
        );

        if (canPlace) {
          // Place all periods of the session
          for (let i = 0; i < sessions.length; i++) {
            const newSlot = new this.slotModel({
              generationId: generation._id,
              sectionId: new Types.ObjectId(sectionId),
              subjectId: new Types.ObjectId(subjectId),
              teacherId: new Types.ObjectId(teacherId),
              day: slot.day,
              period: slot.period + i,
              status: 'active',
            });

            slots.push(newSlot);

            // Mark as occupied
            teacherSlots[teacherId][slot.day][slot.period + i - 1] = false;
            sectionSlots[sectionId][slot.day][slot.period + i - 1] = false;
          }
          placed++;
        }
      }

      // Check if all sessions were placed
      if (placed < sessions.perWeek) {
        const conflict = new this.conflictModel({
          generationId: generation._id,
          type: 'insufficient_slots',
          message: `Could not place all ${sessions.perWeek} sessions for ${(assignment.subjectId as any).name} (${(assignment.sectionId as any).code}) with ${(assignment.teacherId as any).name}. Only placed ${placed}.`,
          severity: assignment.constraint === 'hard' ? 'error' : 'warning',
        });
        conflicts.push(conflict);
      }
    }

    // Save all slots and conflicts in bulk
    if (slots.length > 0) {
      await this.slotModel.insertMany(slots);
    }
    if (conflicts.length > 0) {
      await this.conflictModel.insertMany(conflicts);
    }

    // Calculate generation time
    const generationTime = (Date.now() - startTime) / 1000;
    generation.generationTime = generationTime;
    await generation.save();

    return generation;
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  private initializeAvailability(
    entities: string[],
    days: string[],
    periodsPerDay: number
  ): Record<string, Record<string, boolean[]>> {
    const availability: Record<string, Record<string, boolean[]>> = {};
    
    entities.forEach(entity => {
      availability[entity] = {};
      days.forEach(day => {
        availability[entity][day] = Array(periodsPerDay).fill(true);
      });
    });
    
    return availability;
  }

  private findValidSlots(
    sectionId: string,
    teacherId: string,
    days: string[],
    periodsPerDay: number,
    maxConsecutive: number,
    sessionLength: number,
    sectionSlots: Record<string, Record<string, boolean[]>>,
    teacherSlots: Record<string, Record<string, boolean[]>>,
    existingSlots: TimetableSlot[]
  ): { day: string; period: number }[] {
    const validSlots: { day: string; period: number }[] = [];

    days.forEach(day => {
      for (let period = 1; period <= periodsPerDay - sessionLength + 1; period++) {
        // Check if all periods of session are available
        const canPlace = this.canPlaceSession(
          sectionId,
          teacherId,
          day,
          period,
          sessionLength,
          sectionSlots,
          teacherSlots
        );

        if (canPlace) {
          // Check consecutive limit
          const consecutiveCount = this.getConsecutiveCount(
            sectionId,
            day,
            period,
            sectionSlots
          );

          if (consecutiveCount < maxConsecutive) {
            validSlots.push({ day, period });
          }
        }
      }
    });

    return validSlots;
  }

  private canPlaceSession(
    sectionId: string,
    teacherId: string,
    day: string,
    startPeriod: number,
    sessionLength: number,
    sectionSlots: Record<string, Record<string, boolean[]>>,
    teacherSlots: Record<string, Record<string, boolean[]>>
  ): boolean {
    for (let i = 0; i < sessionLength; i++) {
      const period = startPeriod + i;
      if (
        !teacherSlots[teacherId]?.[day]?.[period - 1] ||
        !sectionSlots[sectionId]?.[day]?.[period - 1]
      ) {
        return false;
      }
    }
    return true;
  }

  private getConsecutiveCount(
    sectionId: string,
    day: string,
    period: number,
    sectionSlots: Record<string, Record<string, boolean[]>>
  ): number {
    let count = 0;
    
    // Check backwards
    for (let p = period - 2; p >= 0; p--) {
      if (!sectionSlots[sectionId][day][p]) {
        count++;
      } else {
        break;
      }
    }
    
    return count;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  async findAll(): Promise<Generation[]> {
    return await this.generationModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<any> {
    const generation = await this.generationModel.findById(id).exec();

    if (!generation) {
      throw new NotFoundException(`Generation with ID ${id} not found`);
    }

    // Fetch slots and conflicts separately
    const slots = await this.slotModel
      .find({ generationId: id })
      .populate('sectionId')
      .populate('subjectId')
      .populate('teacherId')
      .exec();

    const conflicts = await this.conflictModel
      .find({ generationId: id })
      .exec();

    return {
      ...generation.toObject(),
      slots,
      conflicts,
    };
  }

  async update(id: string, updateDto: UpdateGenerationDto): Promise<Generation> {
    const generation = await this.generationModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();

    if (!generation) {
      throw new NotFoundException(`Generation with ID ${id} not found`);
    }

    return generation;
  }

  async remove(id: string): Promise<void> {
    // Delete generation, slots, and conflicts
    await Promise.all([
      this.generationModel.findByIdAndDelete(id).exec(),
      this.slotModel.deleteMany({ generationId: id }).exec(),
      this.conflictModel.deleteMany({ generationId: id }).exec(),
    ]);
  }

  // Update a single slot
  async updateSlot(generationId: string, updateSlotDto: UpdateSlotDto): Promise<TimetableSlot> {
    const slot = await this.slotModel
      .findByIdAndUpdate(
        updateSlotDto.slotId,
        {
          ...updateSlotDto,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .exec();

    if (!slot) {
      throw new NotFoundException(`Slot with ID ${updateSlotDto.slotId} not found`);
    }

    return slot;
  }

  // Activate a generation
  async activate(id: string): Promise<Generation> {
    await this.generationModel.updateMany(
      { status: 'active' },
      { status: 'archived' }
    );

    const generation = await this.generationModel
      .findByIdAndUpdate(id, { status: 'active' }, { new: true })
      .exec();

    if (!generation) {
      throw new NotFoundException(`Generation with ID ${id} not found`);
    }

    return generation;
  }
}