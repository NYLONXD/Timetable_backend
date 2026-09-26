// src/timetable/timetable.service.ts
// FIXED VERSION with proper slot management and validation

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
  // CORE GENERATION ALGORITHM (FIXED)
  // ============================================

  async generate(generateDto: GenerateTimetableDto): Promise<Generation> {
    const startTime = Date.now();
    
    const populatedAssignments = await this.assignmentsService.findByIds(
      generateDto.assignmentIds,
    );

    if (populatedAssignments.length === 0) {
      throw new BadRequestException('No valid assignments provided');
    }

    // Refs arrive as full documents, so take ids from _id: toString() on a document
    // returns a text dump of it. A ref is null if its document has since been deleted.
    const assignments = populatedAssignments.map((assignment) => {
      const {
        sectionId: section,
        subjectId: subject,
        teacherId: teacher,
      } = assignment;
      if (!section || !subject || !teacher) {
        throw new BadRequestException(
          'Some selected assignments point to a section, subject or teacher that no longer exists. Edit or delete them, then generate again.',
        );
      }
      return {
        sectionId: section._id.toString(),
        subjectId: subject._id.toString(),
        teacherId: teacher._id.toString(),
        label: `${subject.name} (${section.code}) with ${teacher.name}`,
        sessions: assignment.sessions,
        constraint: assignment.constraint,
        priority: assignment.priority,
      };
    });

    const generation = new this.generationModel({
      name: generateDto.name,
      config: generateDto.config,
      status: 'draft',
    });
    await generation.save();

    const teacherAvailability = await this.teacherAvailabilityService.getAllAvailability();

    // Initialize availability matrices with proper period indexing
    const teacherSlots = this.initializeAvailability(
      assignments.map((a) => a.teacherId),
      generateDto.config.days,
      generateDto.config.periodsPerDay
    );

    const sectionSlots = this.initializeAvailability(
      assignments.map((a) => a.sectionId),
      generateDto.config.days,
      generateDto.config.periodsPerDay
    );

    // Apply teacher unavailability constraints
    teacherAvailability.forEach(avail => {
      if (avail.type === 'unavailable') {
        const teacherId = avail.teacherId.toString();
        const dayIndex = generateDto.config.days.indexOf(avail.day);
        if (dayIndex !== -1 && teacherSlots[teacherId]) {
          const periodIndex = avail.period - 1; // Convert 1-indexed to 0-indexed
          if (periodIndex >= 0 && periodIndex < generateDto.config.periodsPerDay) {
            teacherSlots[teacherId][avail.day][periodIndex] = false;
          }
        }
      }
    });

    // Mark break/lunch periods as unavailable for ALL sections
    const breakPeriodsList: number[] = [
      ...(generateDto.config.breakPeriods || []),
      ...(generateDto.config.lunchPeriod ? [generateDto.config.lunchPeriod] : [])
    ].filter((p): p is number => p !== undefined && p > 0);
    const breakPeriods = new Set(breakPeriodsList);

    Object.keys(sectionSlots).forEach(sectionId => {
      generateDto.config.days.forEach(day => {
        breakPeriods.forEach((period: number) => {
          const periodIndex = period - 1;
          if (periodIndex >= 0 && periodIndex < generateDto.config.periodsPerDay) {
            sectionSlots[sectionId][day][periodIndex] = false;
          }
        });
      });
    });

    const slots: TimetableSlot[] = [];
    const conflicts: Conflict[] = [];

    // Sort assignments: hard constraints first, then by priority, then by session count
    const sortedAssignments = [...assignments].sort((a, b) => {
      if (a.constraint === 'hard' && b.constraint !== 'hard') return -1;
      if (a.constraint !== 'hard' && b.constraint === 'hard') return 1;
      if (a.priority !== b.priority) return (b.priority || 5) - (a.priority || 5);
      return (b.sessions.perWeek * b.sessions.length) - (a.sessions.perWeek * a.sessions.length);
    });

    // Place each assignment
    for (const assignment of sortedAssignments) {
      const { sectionId, subjectId, teacherId, sessions } = assignment;

      let placed = 0;
      const maxAttempts = generateDto.config.days.length * generateDto.config.periodsPerDay;
      let attempts = 0;

      while (placed < sessions.perWeek && attempts < maxAttempts) {
        attempts++;

        // Find a valid slot for this session
        const validSlot = this.findNextValidSlot(
          sectionId,
          teacherId,
          generateDto.config.days,
          generateDto.config.periodsPerDay,
          generateDto.config.maxConsecutive,
          sessions.length,
          sectionSlots,
          teacherSlots,
          breakPeriods
        );

        if (!validSlot) {
          break; // No more valid slots available
        }

        // Place all periods of the session
        for (let i = 0; i < sessions.length; i++) {
          const currentPeriod = validSlot.period + i;
          
          const newSlot = new this.slotModel({
            generationId: generation._id,
            sectionId: sectionId,
            subjectId: subjectId,
            teacherId: teacherId,
            day: validSlot.day,
            period: currentPeriod,
            status: 'active',
          });

          slots.push(newSlot);

          // Mark as occupied (convert to 0-indexed)
          const periodIndex = currentPeriod - 1;
          teacherSlots[teacherId][validSlot.day][periodIndex] = false;
          sectionSlots[sectionId][validSlot.day][periodIndex] = false;
        }
        
        placed++;
      }

      // Log conflicts if not all sessions were placed
      if (placed < sessions.perWeek) {
        const conflict = new this.conflictModel({
          generationId: generation._id,
          type: 'insufficient_slots',
          message: `Could not place all ${sessions.perWeek} sessions for ${assignment.label}. Only placed ${placed}/${sessions.perWeek} sessions.`,
          severity: assignment.constraint === 'hard' ? 'error' : 'warning',
        });
        conflicts.push(conflict);
      }
    }

    // Save all slots and conflicts
    if (slots.length > 0) {
      await this.slotModel.insertMany(slots);
    }
    if (conflicts.length > 0) {
      await this.conflictModel.insertMany(conflicts);
    }

    const generationTime = (Date.now() - startTime) / 1000;
    generation.generationTime = generationTime;
    await generation.save();

    return generation;
  }

  // ============================================
  // FIXED HELPER FUNCTIONS
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

  private findNextValidSlot(
    sectionId: string,
    teacherId: string,
    days: string[],
    periodsPerDay: number,
    maxConsecutive: number,
    sessionLength: number,
    sectionSlots: Record<string, Record<string, boolean[]>>,
    teacherSlots: Record<string, Record<string, boolean[]>>,
    breakPeriods: Set<number>
  ): { day: string; period: number } | null {
    
    // Shuffle days for randomization
    const shuffledDays = this.shuffleArray([...days]);

    for (const day of shuffledDays) {
      // Try each period that could fit the session
      for (let period = 1; period <= periodsPerDay - sessionLength + 1; period++) {
        
        // Check if this period is a break
        if (breakPeriods.has(period)) {
          continue;
        }

        // Check if all periods of the session are available
        const canPlace = this.canPlaceSessionFixed(
          sectionId,
          teacherId,
          day,
          period,
          sessionLength,
          periodsPerDay,
          sectionSlots,
          teacherSlots,
          breakPeriods
        );

        if (!canPlace) {
          continue;
        }

        // Check consecutive class limit (only for section, not teacher)
        const runLength = this.getConsecutiveRunLength(
          sectionId,
          day,
          period,
          sessionLength,
          periodsPerDay,
          sectionSlots,
          breakPeriods,
        );

        if (runLength > maxConsecutive) {
          continue;
        }

        // Valid slot found
        return { day, period };
      }
    }

    return null; // No valid slot found
  }

  private canPlaceSessionFixed(
    sectionId: string,
    teacherId: string,
    day: string,
    startPeriod: number,
    sessionLength: number,
    periodsPerDay: number,
    sectionSlots: Record<string, Record<string, boolean[]>>,
    teacherSlots: Record<string, Record<string, boolean[]>>,
    breakPeriods: Set<number>
  ): boolean {
    
    // Check if session would extend beyond the day
    if (startPeriod + sessionLength - 1 > periodsPerDay) {
      return false;
    }

    // Check each period in the session
    for (let i = 0; i < sessionLength; i++) {
      const currentPeriod = startPeriod + i;
      const periodIndex = currentPeriod - 1; // Convert to 0-indexed

      // Check if period is a break
      if (breakPeriods.has(currentPeriod)) {
        return false;
      }

      // Check teacher availability
      if (!teacherSlots[teacherId]?.[day]?.[periodIndex]) {
        return false;
      }

      // Check section availability
      if (!sectionSlots[sectionId]?.[day]?.[periodIndex]) {
        return false;
      }
    }

    return true;
  }

  // Length of the unbroken run of classes the session would be part of, including classes
  // already placed directly before AND after it. Breaks end a run rather than extend it.
  private getConsecutiveRunLength(
    sectionId: string,
    day: string,
    startPeriod: number,
    sessionLength: number,
    periodsPerDay: number,
    sectionSlots: Record<string, Record<string, boolean[]>>,
    breakPeriods: Set<number>,
  ): number {
    // Break periods are also marked unavailable in sectionSlots, so exclude them explicitly
    const isClass = (period: number) =>
      !breakPeriods.has(period) && !sectionSlots[sectionId][day][period - 1];

    let first = startPeriod;
    while (first > 1 && isClass(first - 1)) {
      first--;
    }
    let last = startPeriod + sessionLength - 1;
    while (last < periodsPerDay && isClass(last + 1)) {
      last++;
    }
    return last - first + 1;
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

  // For the list view: each generation with how many slots and conflicts it has
  async findAll() {
    const generations = await this.generationModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const ids = generations.map((g) => g._id);
    const [slotCounts, conflictCounts] = await Promise.all([
      this.countByGeneration(this.slotModel, ids),
      this.countByGeneration(this.conflictModel, ids),
    ]);

    return generations.map((g) => ({
      ...g,
      slotCount: slotCounts.get(String(g._id)) ?? 0,
      conflictCount: conflictCounts.get(String(g._id)) ?? 0,
    }));
  }

  private async countByGeneration(
    model: Model<any>,
    generationIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    const counts = await model.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { generationId: { $in: generationIds } } },
      { $group: { _id: '$generationId', count: { $sum: 1 } } },
    ]);
    return new Map(counts.map((c) => [String(c._id), c.count]));
  }

  async findOne(id: string): Promise<any> {
    const generation = await this.generationModel.findById(id).exec();
    if (!generation) {
      throw new NotFoundException(`Generation with ID ${id} not found`);
    }

    const slots = await this.slotModel
      .find({ generationId: id })
      .populate('sectionId')
      .populate('subjectId')
      .populate('teacherId')
      .exec();

    const conflicts = await this.conflictModel.find({ generationId: id }).exec();

    return { ...generation.toObject(), slots, conflicts };
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
    await Promise.all([
      this.generationModel.findByIdAndDelete(id).exec(),
      this.slotModel.deleteMany({ generationId: id }).exec(),
      this.conflictModel.deleteMany({ generationId: id }).exec(),
    ]);
  }

  async updateSlot(generationId: string, updateSlotDto: UpdateSlotDto): Promise<TimetableSlot> {
    const slot = await this.slotModel
      .findByIdAndUpdate(
        updateSlotDto.slotId,
        { ...updateSlotDto, updatedAt: new Date() },
        { new: true }
      )
      .exec();

    if (!slot) {
      throw new NotFoundException(`Slot with ID ${updateSlotDto.slotId} not found`);
    }

    return slot;
  }

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
