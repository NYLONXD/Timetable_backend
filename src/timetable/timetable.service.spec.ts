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
import { Room, RoomSchema } from '../rooms/schemas/room.schema';
import { Section, SectionSchema } from '../sections/schemas/section.schema';
import { Subject, SubjectSchema } from '../subjects/schemas/subject.schema';
import { TeacherAvailabilityService } from '../teacher-availability/teacher-availability.service';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema';
import { Term, TermSchema } from '../terms/schemas/term.schema';

// The scheduling rules themselves are tested in scheduler.spec.ts. These tests cover what
// the service adds: reading populated documents, and writing the timetable back.

// Real models that never connect to a database, so casting and population behave as in production
const SlotModel = model(TimetableSlot.name, TimetableSlotSchema);
const AssignmentModel = model(Assignment.name, AssignmentSchema);
const SectionModel = model(Section.name, SectionSchema);
const SubjectModel = model(Subject.name, SubjectSchema);
const TeacherModel = model(Teacher.name, TeacherSchema);
const RoomModel = model(Room.name, RoomSchema);
const TermModel = model(Term.name, TermSchema);

type Slot = HydratedDocument<TimetableSlot>;

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const term = new TermModel({
  name: 'Test term',
  days: WEEK,
  periodsPerDay: 6,
  lunchPeriod: 4,
  periodTimes: [
    { start: '09:00', end: '09:50' },
    { start: '09:50', end: '10:40' },
    { start: '10:50', end: '11:40' },
    { start: '11:40', end: '12:30' },
    { start: '13:15', end: '14:05' },
    { start: '14:05', end: '14:55' },
  ],
});

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

// Same shape AssignmentsService.findByIds returns: refs populated with their documents
const newAssignment = (
  refs: {
    sections: ReturnType<typeof newSection>[];
    subject?: ReturnType<typeof newSubject>;
    teacher?: ReturnType<typeof newTeacher>;
    room?: HydratedDocument<Room>;
  },
  perWeek = 2,
) =>
  new AssignmentModel({
    sectionIds: refs.sections,
    subjectId: refs.subject ?? newSubject(),
    teacherId: refs.teacher ?? newTeacher(),
    roomId: refs.room,
    sessions: { perWeek, length: 1 },
    constraint: 'hard',
    priority: 5,
  });

// A chainable, awaitable stand-in for a Mongoose query
const query = <T>(result: T) => {
  const q = {
    select: () => q,
    lean: () => q,
    sort: () => q,
    populate: () => q,
    exec: () => Promise.resolve(result),
    then: (resolve: (value: T) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

class FakeGenerationModel {
  static find = () => query([]); // no other active timetables
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
      find: () => query([]),
      insertMany: jest.fn((docs: T[]) => {
        saved.push(...docs);
        return Promise.resolve(docs);
      }),
    },
  );

async function generate(
  assignments: unknown[],
  {
    rooms = [] as HydratedDocument<Room>[],
    availability = [] as object[],
  } = {},
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
        provide: getModelToken(Term.name),
        useValue: { findById: () => query(term) },
      },
      {
        provide: getModelToken(Room.name),
        useValue: { find: () => query(rooms.map((r) => r.toObject())) },
      },
      {
        provide: AssignmentsService,
        useValue: { findByIds: () => Promise.resolve(assignments) },
      },
      {
        provide: TeacherAvailabilityService,
        useValue: { findForTeachers: () => Promise.resolve(availability) },
      },
    ],
  }).compile();

  const generation = (await moduleRef.get(TimetableService).generate({
    name: 'Test',
    termId: String(term._id),
    maxConsecutive: 3,
    assignmentIds: [],
  })) as unknown as FakeGenerationModel;
  return { slots, conflicts, generation };
}

describe('TimetableService.generate', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stores refs as ObjectIds, not text dumps of the populated documents', async () => {
    const sections = [newSection(), newSection()]; // a combined class
    const subject = newSubject();
    const teacher = newTeacher();
    const room = new RoomModel({
      code: 'LH-1',
      type: 'lecture',
      capacity: 200,
    });

    const { slots } = await generate(
      [newAssignment({ sections, subject, teacher, room }, 3)],
      { rooms: [room] },
    );

    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.validateSync()).toBeUndefined();
      expect(slot.sectionIds.map(String)).toEqual(
        sections.map((s) => String(s._id)),
      );
      expect(String(slot.subjectId)).toBe(String(subject._id));
      expect(String(slot.teacherId)).toBe(String(teacher._id));
      expect(String(slot.roomId)).toBe(String(room._id));
    }
  });

  it("records the term, the sections covered and the term's bell schedule", async () => {
    const sections = [newSection(), newSection()];
    const { generation } = await generate(
      sections.map((s) => newAssignment({ sections: [s] })),
    );

    expect(generation).toMatchObject({
      termId: term._id,
      config: {
        days: WEEK,
        periodsPerDay: 6,
        lunchPeriod: 4,
        maxConsecutive: 3,
      },
    });
    expect(
      (generation as unknown as Generation).sectionIds.map(String).sort(),
    ).toEqual(sections.map((s) => String(s._id)).sort());
    expect(
      (generation as unknown as Generation).config.periodTimes,
    ).toHaveLength(6);
  });

  it('passes teacher unavailability to the scheduler', async () => {
    const teacher = newTeacher();
    const availability = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'].flatMap(
      (day) =>
        [1, 2, 3, 5, 6].map((period) => ({
          teacherId: teacher._id,
          day,
          period,
          type: 'unavailable',
        })),
    );

    const { slots } = await generate(
      [newAssignment({ sections: [newSection()], teacher }, 3)],
      { availability },
    );

    expect(slots.map((s) => s.day)).toEqual(Array(3).fill('Friday'));
  });

  it('names the subject, sections and teacher in conflict messages', async () => {
    const section = newSection();
    const subject = newSubject();
    const teacher = newTeacher();
    // Free only on Monday period 1, so just one of the two sessions fits
    const availability = WEEK.flatMap((day) =>
      [1, 2, 3, 5, 6]
        .filter((period) => day !== 'Monday' || period !== 1)
        .map((period) => ({
          teacherId: teacher._id,
          day,
          period,
          type: 'unavailable',
        })),
    );

    const { conflicts } = await generate(
      [newAssignment({ sections: [section], subject, teacher }, 2)],
      { availability },
    );

    expect(conflicts.map((c) => c.message)).toContain(
      `Could not place all 2 sessions for ${subject.name} (${section.code}) with ${teacher.name}. Only placed 1/2 sessions.`,
    );
  });

  it('rejects the request, before saving anything, when a referenced teacher was deleted', async () => {
    const save = jest.spyOn(FakeGenerationModel.prototype, 'save');
    const orphan = newAssignment({ sections: [newSection()] });
    orphan.set('teacherId', null); // what populate returns once the teacher is gone

    await expect(generate([orphan])).rejects.toThrow(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects the request when every section of an assignment was deleted', async () => {
    const orphan = newAssignment({ sections: [newSection()] });
    orphan.set('sectionIds', []);

    await expect(generate([orphan])).rejects.toThrow(BadRequestException);
  });
});
