import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { HydratedDocument, model, Types } from 'mongoose';
import { TimetableService } from './timetable.service';
import { Conflict } from './schemas/conflicts.schema';
import { Generation } from './schemas/generation.schema';
import {
  TimetableSlot,
  TimetableSlotSchema,
} from './schemas/timetable-slots.schema';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  Assignment,
  AssignmentSchema,
} from '../assignments/schemas/assignment.schema';
import { Section, SectionSchema } from '../sections/schemas/section.schema';
import { Subject, SubjectSchema } from '../subjects/schemas/subject.schema';
import { TeacherAvailabilityService } from '../teacher-availability/teacher-availability.service';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema';

// Real models that never connect to a database, so casting and population behave as in production
const SlotModel = model(TimetableSlot.name, TimetableSlotSchema);
const AssignmentModel = model(Assignment.name, AssignmentSchema);
const SectionModel = model(Section.name, SectionSchema);
const SubjectModel = model(Subject.name, SubjectSchema);
const TeacherModel = model(Teacher.name, TeacherSchema);

type Slot = HydratedDocument<TimetableSlot>;
type Config = {
  days: string[];
  periodsPerDay: number;
  maxConsecutive: number;
  breakPeriods?: number[];
  lunchPeriod?: number;
};

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

let seq = 0;
const newSection = () =>
  new SectionModel({ code: `SEC-${++seq}`, semester: 1, branch: 'CSE' });
const newSubject = () =>
  new SubjectModel({
    code: `SUB-${++seq}`,
    name: `Subject ${seq}`,
    category: 'theory',
  });
const newTeacher = () =>
  new TeacherModel({ staffId: `T-${++seq}`, name: `Teacher ${seq}` });

type Refs = {
  section: ReturnType<typeof newSection>;
  subject: ReturnType<typeof newSubject>;
  teacher: ReturnType<typeof newTeacher>;
};

const newRefs = (teacher = newTeacher()): Refs => ({
  section: newSection(),
  subject: newSubject(),
  teacher,
});

// Same shape AssignmentsService.findByIds returns: refs populated with their documents
const newAssignment = (
  { section, subject, teacher }: Refs,
  perWeek: number,
  { length = 1, priority = 5 } = {},
) =>
  new AssignmentModel({
    sectionId: section,
    subjectId: subject,
    teacherId: teacher,
    sessions: { perWeek, length },
    constraint: 'hard',
    priority,
  });

const unavailable = (
  teacherId: Types.ObjectId,
  day: string,
  periods: number[],
) => periods.map((period) => ({ teacherId, day, period, type: 'unavailable' }));

class FakeGenerationModel {
  _id = new Types.ObjectId();
  constructor(data: object) {
    Object.assign(this, data);
  }
  save() {
    return Promise.resolve(this);
  }
}

// Stands in for a Mongoose model: `new` builds a document, insertMany records it instead of writing
const recordingModel = <T>(build: (data: object) => T, saved: T[]) =>
  Object.assign(
    jest.fn((data: object) => build(data)),
    {
      insertMany: jest.fn((docs: T[]) => {
        saved.push(...docs);
        return Promise.resolve(docs);
      }),
    },
  );

async function generate(
  assignments: unknown[],
  config: Config,
  availability: ReturnType<typeof unavailable> = [],
) {
  const slots: Slot[] = [];
  const conflicts: Conflict[] = [];
  const moduleRef = await Test.createTestingModule({
    providers: [
      TimetableService,
      {
        provide: getModelToken(Generation.name),
        useValue: FakeGenerationModel,
      },
      {
        provide: getModelToken(TimetableSlot.name),
        useValue: recordingModel((data) => new SlotModel(data), slots),
      },
      {
        provide: getModelToken(Conflict.name),
        useValue: recordingModel((data) => data as Conflict, conflicts),
      },
      {
        provide: AssignmentsService,
        useValue: { findByIds: () => Promise.resolve(assignments) },
      },
      {
        provide: TeacherAvailabilityService,
        useValue: { getAllAvailability: () => Promise.resolve(availability) },
      },
    ],
  }).compile();

  await moduleRef
    .get(TimetableService)
    .generate({ name: 'Test', config, assignmentIds: [] });
  return { slots, conflicts };
}

const periodsOf = (slots: Slot[]) =>
  slots.map((s) => s.period).sort((a, b) => a - b);

// Longest unbroken run of classes any section has on any day. Breaks and lunch end a run.
function longestRun(slots: Slot[], config: Config) {
  const breaks = new Set([...(config.breakPeriods ?? []), config.lunchPeriod]);
  const taken = new Set(
    slots.map((s) => `${String(s.sectionId)}|${s.day}|${s.period}`),
  );
  let longest = 0;
  for (const sectionId of new Set(slots.map((s) => String(s.sectionId)))) {
    for (const day of config.days) {
      let run = 0;
      for (let period = 1; period <= config.periodsPerDay; period++) {
        const isClass =
          !breaks.has(period) && taken.has(`${sectionId}|${day}|${period}`);
        run = isClass ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
  }
  return longest;
}

describe('TimetableService.generate', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stores slot refs as ObjectIds, not text dumps of the populated documents', async () => {
    const refs = newRefs();

    const { slots } = await generate([newAssignment(refs, 3)], {
      days: WEEK,
      periodsPerDay: 6,
      maxConsecutive: 3,
    });

    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.validateSync()).toBeUndefined();
      expect(String(slot.sectionId)).toBe(String(refs.section._id));
      expect(String(slot.subjectId)).toBe(String(refs.subject._id));
      expect(String(slot.teacherId)).toBe(String(refs.teacher._id));
    }
  });

  it('never books a teacher in a period they marked unavailable', async () => {
    const teacher = newTeacher();
    // Unavailable all week except Friday
    const availability = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'].flatMap(
      (day) => unavailable(teacher._id, day, [1, 2, 3, 4, 5, 6]),
    );

    const { slots, conflicts } = await generate(
      [newAssignment(newRefs(teacher), 4)],
      { days: WEEK, periodsPerDay: 6, maxConsecutive: 3 },
      availability,
    );

    expect(conflicts).toEqual([]);
    expect(slots.map((s) => s.day)).toEqual(Array(4).fill('Friday'));
  });

  it('never double-books a teacher or section, and keeps breaks and lunch free', async () => {
    const config = {
      days: WEEK,
      periodsPerDay: 8,
      maxConsecutive: 3,
      breakPeriods: [3],
      lunchPeriod: 5,
    };
    const teachers = [newTeacher(), newTeacher(), newTeacher()];
    // Every teacher teaches every section, so they all compete for the same periods
    const assignments = [1, 2, 3, 4].flatMap(() => {
      const section = newSection();
      return teachers.map((teacher, i) =>
        newAssignment({ section, subject: newSubject(), teacher }, 3, {
          length: i === 0 ? 2 : 1,
        }),
      );
    });

    const { slots } = await generate(assignments, config);

    const teacherPeriods = slots.map(
      (s) => `${String(s.teacherId)}|${s.day}|${s.period}`,
    );
    const sectionPeriods = slots.map(
      (s) => `${String(s.sectionId)}|${s.day}|${s.period}`,
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(new Set(teacherPeriods).size).toBe(slots.length);
    expect(new Set(sectionPeriods).size).toBe(slots.length);
    expect(slots.filter((s) => s.period === 3 || s.period === 5)).toEqual([]);
    expect(longestRun(slots, config)).toBeLessThanOrEqual(
      config.maxConsecutive,
    );
  });

  it('counts classes right after a slot toward maxConsecutive, not only classes before it', async () => {
    const section = newSection();
    const labTeacher = newTeacher();
    const lectureTeacher = newTeacher();
    const lab = newAssignment(
      { section, subject: newSubject(), teacher: labTeacher },
      1,
      { length: 2, priority: 10 },
    );
    const lecture = newAssignment(
      { section, subject: newSubject(), teacher: lectureTeacher },
      1,
      { priority: 1 },
    );
    // The lab goes first and only fits in periods 3-4. The lecture can't take period 1,
    // and periods 2 and 5 would each join the lab in a run of 3 classes.
    const availability = [
      ...unavailable(labTeacher._id, 'Monday', [1, 2, 5]),
      ...unavailable(lectureTeacher._id, 'Monday', [1]),
    ];

    const { slots, conflicts } = await generate(
      [lecture, lab],
      { days: ['Monday'], periodsPerDay: 5, maxConsecutive: 2 },
      availability,
    );

    expect(periodsOf(slots)).toEqual([3, 4]);
    expect(conflicts.map((c) => c.type)).toEqual(['insufficient_slots']);
  });

  it('lets classes resume right after lunch instead of counting lunch as a class', async () => {
    const { slots, conflicts } = await generate([newAssignment(newRefs(), 4)], {
      days: ['Monday'],
      periodsPerDay: 5,
      maxConsecutive: 2,
      lunchPeriod: 3,
    });

    expect(conflicts).toEqual([]);
    expect(periodsOf(slots)).toEqual([1, 2, 4, 5]);
  });

  it('rejects the request before saving anything when an assignment points to a deleted teacher', async () => {
    const save = jest.spyOn(FakeGenerationModel.prototype, 'save');
    const orphan = newAssignment(newRefs(), 2);
    orphan.set('teacherId', null); // what populate returns once the teacher is gone

    await expect(
      generate([orphan], { days: WEEK, periodsPerDay: 6, maxConsecutive: 3 }),
    ).rejects.toThrow(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
});
