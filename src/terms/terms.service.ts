// src/terms/terms.service.ts
// Purpose: Business logic for terms and their bell schedule

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isDuplicateKey } from '../database/mongo-errors';
import { Model, Types } from 'mongoose';
import { PeriodTime, Term, TermDocument } from './schemas/term.schema';
import { CreateTermDto } from './dto/create-term.dto';
import { UpdateTermDto } from './dto/update-term.dto';
import { Generation } from '../timetable/schemas/generation.schema';

type BellSchedule = Pick<
  Term,
  'days' | 'periodsPerDay' | 'breakPeriods' | 'lunchPeriod'
> & { periodTimes?: PeriodTime[] };

@Injectable()
export class TermsService {
  constructor(
    @InjectModel(Term.name) private termModel: Model<TermDocument>,
    @InjectModel(Generation.name) private generationModel: Model<Generation>,
  ) {}

  async create(createDto: CreateTermDto): Promise<Term> {
    this.validateSchedule({
      ...createDto,
      breakPeriods: createDto.breakPeriods ?? [],
    });
    try {
      return await new this.termModel(createDto).save();
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException('A term with this name already exists');
      }
      throw error;
    }
  }

  // Newest first, each with how many timetables were generated for it
  async findAll() {
    const terms = await this.termModel.find().sort({ createdAt: -1 }).lean();
    const counts = await this.generationModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { termId: { $in: terms.map((t) => t._id) } } },
      { $group: { _id: '$termId', count: { $sum: 1 } } },
    ]);
    const byTerm = new Map(counts.map((c) => [String(c._id), c.count]));
    return terms.map((t) => ({
      ...t,
      timetableCount: byTerm.get(String(t._id)) ?? 0,
    }));
  }

  async findOne(id: string): Promise<TermDocument> {
    const term = await this.termModel.findById(id).exec();
    if (!term) {
      throw new NotFoundException(`Term with ID ${id} not found`);
    }
    return term;
  }

  async update(id: string, updateDto: UpdateTermDto): Promise<Term> {
    const term = await this.findOne(id);
    const next: BellSchedule = {
      days: updateDto.days ?? term.days,
      periodsPerDay: updateDto.periodsPerDay ?? term.periodsPerDay,
      breakPeriods: updateDto.breakPeriods ?? term.breakPeriods,
      lunchPeriod:
        updateDto.lunchPeriod === undefined
          ? term.lunchPeriod
          : updateDto.lunchPeriod,
      periodTimes: updateDto.periodTimes ?? term.periodTimes,
    };
    this.validateSchedule(next);

    // Timetables of a term are checked against each other by day and period number,
    // so the period structure can't change once any exist. Clock times and names can.
    if (this.structureChanged(term, next)) {
      const timetables = await this.generationModel.countDocuments({
        termId: term._id,
      });
      if (timetables > 0) {
        throw new ConflictException(
          `This term already has ${timetables} timetable(s), so its days, periods and breaks can't change. Create a new term instead.`,
        );
      }
    }

    try {
      const updated = await this.termModel
        .findByIdAndUpdate(id, updateDto, { new: true, runValidators: true })
        .exec();
      if (!updated) {
        throw new NotFoundException(`Term with ID ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException('A term with this name already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const timetables = await this.generationModel.countDocuments({
      termId: id,
    });
    if (timetables > 0) {
      throw new ConflictException(
        `This term has ${timetables} timetable(s). Delete them first.`,
      );
    }
    const result = await this.termModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Term with ID ${id} not found`);
    }
  }

  private validateSchedule(schedule: BellSchedule) {
    const { periodsPerDay } = schedule;
    const breaks = [
      ...(schedule.breakPeriods ?? []),
      ...(schedule.lunchPeriod ? [schedule.lunchPeriod] : []),
    ];
    for (const period of breaks) {
      if (period > periodsPerDay) {
        throw new BadRequestException(
          `Break period ${period} is outside the ${periodsPerDay} periods of the day`,
        );
      }
    }
    if (new Set(breaks).size >= periodsPerDay) {
      throw new BadRequestException(
        'At least one period must be free of breaks',
      );
    }

    const times = schedule.periodTimes ?? [];
    if (times.length === 0) return;
    if (times.length !== periodsPerDay) {
      throw new BadRequestException(
        `Give a time for each of the ${periodsPerDay} periods, or leave the times empty`,
      );
    }
    times.forEach(({ start, end }, i) => {
      // Zero-padded 24h times compare correctly as strings
      if (start >= end) {
        throw new BadRequestException(
          `Period ${i + 1} must end after it starts`,
        );
      }
      if (i > 0 && start < times[i - 1].end) {
        throw new BadRequestException(
          `Period ${i + 1} starts before period ${i} ends`,
        );
      }
    });
  }

  private structureChanged(current: Term, next: BellSchedule) {
    const sameSet = (a: (string | number)[], b: (string | number)[]) =>
      a.length === b.length && a.every((x) => b.includes(x));
    return (
      current.periodsPerDay !== next.periodsPerDay ||
      (current.lunchPeriod ?? null) !== (next.lunchPeriod ?? null) ||
      !sameSet(current.days, next.days) ||
      !sameSet(current.breakPeriods, next.breakPeriods)
    );
  }
}
