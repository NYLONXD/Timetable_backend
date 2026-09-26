// src/timetable/timetable.service.ts
// Generates timetables with the scheduler and manages them (draft -> active -> archived)

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isDuplicateKey } from '../database/mongo-errors';
import { Model, Types } from 'mongoose';
import { Generation, GenerationDocument } from './schemas/generation.schema';
import {
  TimetableSlot,
  TimetableSlotDocument,
} from './schemas/timetable-slots.schema';
import { Conflict, ConflictDocument } from './schemas/conflicts.schema';
import { GenerateTimetableDto } from './dto/generate-timetable.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { UpdateGenerationDto } from './dto/update-generation.dto';
import { schedule } from './scheduler/scheduler';
import {
  BusyPeriod,
  ClassRequest,
  SchedulerSection,
  SchedulerTeacher,
} from './scheduler/scheduler.types';
import { AssignmentsService } from '../assignments/assignments.service';
import { TeacherAvailabilityService } from '../teacher-availability/teacher-availability.service';
import { Term, TermDocument } from '../terms/schemas/term.schema';
import { Room, RoomDocument } from '../rooms/schemas/room.schema';
import { SectionDocument } from '../sections/schemas/section.schema';

const SLOT_REFS = ['sectionIds', 'subjectId', 'teacherId', 'roomId'];

@Injectable()
export class TimetableService {
  constructor(
    @InjectModel(Generation.name)
    private generationModel: Model<GenerationDocument>,
    @InjectModel(TimetableSlot.name)
    private slotModel: Model<TimetableSlotDocument>,
    @InjectModel(Conflict.name) private conflictModel: Model<ConflictDocument>,
    @InjectModel(Term.name) private termModel: Model<TermDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    private assignmentsService: AssignmentsService,
    private teacherAvailabilityService: TeacherAvailabilityService,
  ) {}

  // ============================================
  // GENERATION
  // ============================================

  async generate(generateDto: GenerateTimetableDto): Promise<Generation> {
    const startTime = Date.now();

    const term = await this.termModel.findById(generateDto.termId).exec();
    if (!term) {
      throw new BadRequestException('Term does not exist');
    }

    const populatedAssignments = await this.assignmentsService.findByIds(
      generateDto.assignmentIds,
    );
    if (populatedAssignments.length === 0) {
      throw new BadRequestException('No valid assignments provided');
    }

    // Refs arrive as full documents, so take ids from _id: toString() on a document returns
    // a text dump of it. A ref is null if its document has since been deleted.
    const sections = new Map<string, SchedulerSection>();
    const teachers = new Map<string, SchedulerTeacher>();
    const classes: (ClassRequest & { subjectId: string })[] = [];
    for (const assignment of populatedAssignments) {
      const {
        subjectId: subject,
        teacherId: teacher,
        roomId: room,
      } = assignment;
      const sectionDocs = assignment.sectionIds.filter(
        (s): s is SectionDocument => s !== null,
      );
      const roomDeleted = !room && assignment.populated('roomId') !== undefined;
      if (
        !subject ||
        !teacher ||
        sectionDocs.length === 0 ||
        sectionDocs.length !== assignment.sectionIds.length ||
        roomDeleted
      ) {
        throw new BadRequestException(
          'Some selected assignments point to a section, subject, teacher or room that no longer exists. Edit or delete them, then generate again.',
        );
      }

      for (const section of sectionDocs) {
        sections.set(section._id.toString(), {
          id: section._id.toString(),
          batches: section.batches ?? [],
          strength: section.strength,
        });
      }
      teachers.set(teacher._id.toString(), {
        id: teacher._id.toString(),
        name: teacher.name,
        maxPerDay: teacher.maxHoursPerDay,
        maxPerWeek: teacher.maxHoursPerWeek,
        unavailable: [],
        preferred: [],
      });

      const codes = sectionDocs.map((s) => s.code).join(' + ');
      const batch = assignment.batch ? ` ${assignment.batch}` : '';
      classes.push({
        id: assignment._id.toString(),
        label: `${subject.name} (${codes}${batch}) with ${teacher.name}`,
        subjectId: subject._id.toString(),
        sectionIds: sectionDocs.map((s) => s._id.toString()),
        batch: assignment.batch ?? undefined,
        teacherId: teacher._id.toString(),
        needsLab: subject.category === 'lab',
        roomId: room?._id.toString(),
        studentCount: assignment.studentCount ?? undefined,
        perWeek: assignment.sessions.perWeek,
        length: assignment.sessions.length,
        hard: assignment.constraint === 'hard',
        priority: assignment.priority ?? 5,
        parallelGroup: assignment.parallelGroup ?? undefined,
      });
    }

    const availability = await this.teacherAvailabilityService.findForTeachers([
      ...teachers.keys(),
    ]);
    for (const avail of availability) {
      const teacher = teachers.get(String(avail.teacherId));
      const list =
        avail.type === 'unavailable'
          ? teacher?.unavailable
          : teacher?.preferred;
      list?.push({ day: avail.day, period: avail.period });
    }

    const rooms = (await this.roomModel.find().lean()).map((r) => ({
      id: r._id.toString(),
      type: r.type,
      capacity: r.capacity,
    }));

    const sectionIds = [...sections.keys()].map((id) => new Types.ObjectId(id));
    const busy = await this.bookedElsewhere(term._id, sectionIds);

    const result = schedule({
      days: term.days,
      periodsPerDay: term.periodsPerDay,
      breakPeriods: [
        ...term.breakPeriods,
        ...(term.lunchPeriod ? [term.lunchPeriod] : []),
      ],
      maxConsecutive: generateDto.maxConsecutive,
      sections: [...sections.values()],
      teachers: [...teachers.values()],
      rooms,
      classes,
      busy,
    });

    const generation = new this.generationModel({
      name: generateDto.name,
      termId: term._id,
      sectionIds,
      config: {
        days: term.days,
        periodsPerDay: term.periodsPerDay,
        maxConsecutive: generateDto.maxConsecutive,
        breakPeriods: term.breakPeriods,
        lunchPeriod: term.lunchPeriod,
        periodTimes: term.periodTimes,
      },
      status: 'draft',
    });
    await generation.save();

    const classById = new Map(classes.map((c) => [c.id, c]));
    const slots = result.placements.map((placement) => {
      const c = classById.get(placement.classId)!;
      return new this.slotModel({
        generationId: generation._id,
        sectionIds: c.sectionIds,
        batch: c.batch,
        subjectId: c.subjectId,
        teacherId: c.teacherId,
        roomId: placement.roomId,
        parallelGroup: c.parallelGroup,
        day: placement.day,
        period: placement.period,
        status: 'active',
      });
    });
    const conflicts = result.problems.map(
      (problem) =>
        new this.conflictModel({ generationId: generation._id, ...problem }),
    );

    if (slots.length > 0) {
      await this.slotModel.insertMany(slots);
    }
    if (conflicts.length > 0) {
      await this.conflictModel.insertMany(conflicts);
    }

    generation.generationTime = (Date.now() - startTime) / 1000;
    await generation.save();

    return generation;
  }

  // Teachers and rooms that the term's active timetables for OTHER sections already use.
  // (Active timetables for the same sections are the ones a new one would replace.)
  private async bookedElsewhere(
    termId: Types.ObjectId,
    sectionIds: Types.ObjectId[],
  ): Promise<BusyPeriod[]> {
    const others = await this.generationModel
      .find({ termId, status: 'active', sectionIds: { $nin: sectionIds } })
      .select('_id')
      .lean();
    if (others.length === 0) return [];

    const slots = await this.slotModel
      .find({ generationId: { $in: others.map((g) => g._id) } })
      .select('teacherId roomId day period')
      .lean();
    return slots.map((s) => ({
      day: s.day,
      period: s.period,
      teacherId: s.teacherId?.toString(),
      roomId: s.roomId?.toString(),
    }));
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  // For the list view: each generation with its term name and how many slots and conflicts it has
  async findAll() {
    const generations = await this.generationModel
      .find()
      .populate('termId', 'name')
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
    const generation = await this.generationModel
      .findById(id)
      .populate('termId', 'name')
      .exec();
    if (!generation) {
      throw new NotFoundException(`Generation with ID ${id} not found`);
    }

    const slots = await this.slotModel
      .find({ generationId: id })
      .populate(SLOT_REFS)
      .exec();

    const conflicts = await this.conflictModel
      .find({ generationId: id })
      .exec();

    return { ...generation.toObject(), slots, conflicts };
  }

  async update(
    id: string,
    updateDto: UpdateGenerationDto,
  ): Promise<Generation> {
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

  async updateSlot(
    generationId: string,
    updateSlotDto: UpdateSlotDto,
  ): Promise<TimetableSlot> {
    const { slotId, ...changes } = updateSlotDto;
    try {
      const slot = await this.slotModel
        .findOneAndUpdate(
          { _id: slotId, generationId },
          { ...changes, updatedAt: new Date() },
          { new: true },
        )
        .exec();
      if (!slot) {
        throw new NotFoundException(
          `Slot with ID ${slotId} not found in this timetable`,
        );
      }
      return slot;
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException(
          'That teacher or room already has a class at this time in this timetable',
        );
      }
      throw error;
    }
  }

  // Replaces the term's active timetables for any of the same sections. Refuses if this one
  // would double-book a teacher or room used by the term's other active timetables, which
  // happens when two drafts were generated before either was activated.
  async activate(id: string): Promise<Generation> {
    const generation = await this.generationModel.findById(id).exec();
    if (!generation) {
      throw new NotFoundException(`Generation with ID ${id} not found`);
    }

    const active = await this.generationModel
      .find({
        termId: generation.termId ?? null,
        status: 'active',
        _id: { $ne: generation._id },
      })
      .select('name sectionIds')
      .lean();
    const mine = new Set(generation.sectionIds.map(String));
    // Timetables from before sections were tracked replace everything in their term, as before
    const replaces = (g: { sectionIds?: Types.ObjectId[] }) =>
      mine.size === 0 ||
      !g.sectionIds?.length ||
      g.sectionIds.some((s) => mine.has(String(s)));
    const replaced = active.filter(replaces);
    const kept = active.filter((g) => !replaces(g));

    const clashes = await this.findClashes(generation._id, kept);
    if (clashes.length > 0) {
      throw new ConflictException(
        `This timetable double-books ${clashes.length} teacher or room period(s) used by other active timetables in its term, e.g. ${clashes.slice(0, 3).join('; ')}. Generate it again so it takes them into account.`,
      );
    }

    await this.generationModel.updateMany(
      { _id: { $in: replaced.map((g) => g._id) } },
      { status: 'archived' },
    );
    generation.status = 'active';
    return await generation.save();
  }

  // Periods where this timetable uses a teacher or room that one of `others` also uses
  private async findClashes(
    generationId: Types.ObjectId,
    others: { _id: Types.ObjectId; name: string }[],
  ): Promise<string[]> {
    if (others.length === 0) return [];

    const names = new Map(others.map((g) => [String(g._id), g.name]));
    const taken = new Map<string, string>(); // "teacher|<id>|Monday|3" -> timetable name
    const theirs = await this.slotModel
      .find({ generationId: { $in: others.map((g) => g._id) } })
      .select('generationId teacherId roomId day period')
      .lean();
    for (const s of theirs) {
      const name = names.get(String(s.generationId)) ?? 'another timetable';
      if (s.teacherId)
        taken.set(`teacher|${String(s.teacherId)}|${s.day}|${s.period}`, name);
      if (s.roomId)
        taken.set(`room|${String(s.roomId)}|${s.day}|${s.period}`, name);
    }

    const mine = await this.slotModel
      .find({ generationId })
      .populate('teacherId', 'name')
      .populate('roomId', 'code')
      .lean<
        {
          day: string;
          period: number;
          teacherId?: { _id: Types.ObjectId; name: string };
          roomId?: { _id: Types.ObjectId; code: string };
        }[]
      >();
    const clashes: string[] = [];
    for (const { day, period, teacherId: teacher, roomId: room } of mine) {
      const teacherClash =
        teacher && taken.get(`teacher|${String(teacher._id)}|${day}|${period}`);
      if (teacherClash) {
        clashes.push(
          `${day} period ${period}: ${teacher.name} also teaches in "${teacherClash}"`,
        );
      }
      const roomClash =
        room && taken.get(`room|${String(room._id)}|${day}|${period}`);
      if (roomClash) {
        clashes.push(
          `${day} period ${period}: room ${room.code} is also used by "${roomClash}"`,
        );
      }
    }
    return clashes;
  }
}
